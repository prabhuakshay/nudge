"""Business rules for Tags: naming, order, putting them on Tasks, merging and deleting them.

Tags are flat and ordered by fractional-indexing keys the server generates; the client only says
which Tag one now follows. Writes to the order lock the user's row, so two concurrent moves never
produce the same key. A Tag's name is unique per user whatever its case, so a name typed in Quick
add finds the Tag the user already has.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Literal

from django.db import IntegrityError, transaction
from django.db.models import Count

from apps.core.errors import DomainRuleError, NotFoundError
from apps.tasks import live
from apps.tasks.archive import active_tasks
from apps.tasks.models import CLOSED_STATUSES, OPEN_STATUSES, Tag, Task, TaskActivity
from apps.tasks.pagination import Page, newest_first
from apps.tasks.rows import as_rows, unpinned
from apps.tasks.siblings import tag_siblings

if TYPE_CHECKING:
    from collections.abc import Iterable

    from django.db.models import QuerySet

    from apps.accounts.models import User
    from apps.core.palette import PaletteColor


TAG_NOT_FOUND = "Tag not found."


class TagRuleError(DomainRuleError):
    """A change to a Tag breaks one of the rules Tags follow."""


def _name_taken(name: str) -> TagRuleError:
    return TagRuleError(f"You already have a Tag named “{name}”.")


def _save(tag: Tag) -> None:
    """Save the Tag, turning a clash with another of the user's names into a rule error."""
    try:
        with transaction.atomic():
            tag.save()
    except IntegrityError as error:
        raise _name_taken(tag.name) from error


def tag(user: User, tag_id: int) -> Tag:
    """Return the user's Tag with this id.

    Raises:
        NotFoundError: There's no such Tag.
    """
    found = user.tags.filter(pk=tag_id).first()
    if found is None:
        raise NotFoundError(TAG_NOT_FOUND)
    return found


def owned_tags(user: User, tag_ids: Iterable[int]) -> list[Tag]:
    """Return the user's Tags with these ids.

    Raises:
        NotFoundError: Any id isn't one of the user's Tags.
    """
    wanted = set(tag_ids)
    found = list(user.tags.filter(pk__in=wanted))
    if len(found) != len(wanted):
        raise NotFoundError(TAG_NOT_FOUND)
    return found


def create_tag(user: User, name: str, *, color: PaletteColor | None = None) -> Tag:
    """Create a Tag last in the user's order; grey when no colour is given.

    Raises:
        TagRuleError: The user already has a Tag of that name.
    """
    with transaction.atomic():
        position = tag_siblings(user).last()
        created = Tag(owner=user, name=name, color=color or "", position=position)
        _save(created)
    return created


def tags_named(user: User, names: Iterable[str]) -> list[Tag]:
    """Return the user's Tags with these names, whatever their case, creating any that are new.

    Call it inside a transaction, so new Tags go only if the change that wanted them commits.
    """
    by_name = {name.casefold(): name for name in names}
    existing = [found for found in user.tags.all() if found.name.casefold() in by_name]
    known = {found.name.casefold() for found in existing}
    created = [create_tag(user, name) for key, name in by_name.items() if key not in known]
    return [*existing, *created]


def update_tag(
    user: User,
    tag_id: int,
    *,
    name: str | None = None,
    color: PaletteColor | Literal[""] | None = None,
) -> Tag:
    """Rename or recolour one of the user's Tags. "" makes it grey.

    Raises:
        NotFoundError: The Tag isn't one of the user's.
        TagRuleError: Another of the user's Tags has that name.
    """
    found = tag(user, tag_id)
    found.name = name if name is not None else found.name
    found.color = color if color is not None else found.color
    _save(found)
    return found


def move_tag(user: User, tag_id: int, after_id: int | None) -> None:
    """Put one of the user's Tags right after another; first for None, last if it isn't theirs.

    Raises:
        NotFoundError: The Tag isn't one of the user's.
    """
    found = tag(user, tag_id)
    if after_id == found.pk:
        return
    with transaction.atomic():
        found.position = tag_siblings(user).after(after_id, moving=found.pk)
        found.save(update_fields=["position", "updated_at"])


def delete_tag(user: User, tag_id: int) -> None:
    """Delete one of the user's Tags for good, recording its removal on each of its Tasks.

    Raises:
        NotFoundError: The Tag isn't one of the user's.
    """
    found = tag(user, tag_id)
    with transaction.atomic():
        TaskActivity.objects.bulk_create(
            _event(task, TaskActivity.Kind.TAG_REMOVED, {"name": found.name})
            for task in found.tasks.all()
        )
        found.delete()


def merge_tag(user: User, tag_id: int, into_id: int) -> None:
    """Move every Task of one of the user's Tags onto another, then delete the first.

    Raises:
        NotFoundError: Either Tag isn't one of the user's.
        TagRuleError: The two are the same Tag.
    """
    source, target = tag(user, tag_id), tag(user, into_id)
    if source == target:
        message = "A Tag can't be merged into itself."
        raise TagRuleError(message)
    data = {"from_tag": source.name, "into_tag": target.name}
    with transaction.atomic():
        tasks = list(source.tasks.all())
        target.tasks.add(*tasks)
        TaskActivity.objects.bulk_create(
            _event(task, TaskActivity.Kind.TAGS_MERGED, data) for task in tasks
        )
        source.delete()


def _event(task: Task, kind: TaskActivity.Kind, data: dict[str, str]) -> TaskActivity:
    return TaskActivity(task=task, kind=kind, data=data)


def retag(task: Task, tags: list[Tag]) -> list[TaskActivity]:
    """Give the Task exactly these Tags; return unsaved Activity events, one per change."""
    current = set(task.tags.all())
    wanted = set(tags)
    added = sorted(wanted - current, key=lambda found: (found.position, found.pk))
    removed = sorted(current - wanted, key=lambda found: (found.position, found.pk))
    task.tags.add(*added)
    task.tags.remove(*removed)
    return [
        *(_event(task, TaskActivity.Kind.TAG_ADDED, {"name": found.name}) for found in added),
        *(_event(task, TaskActivity.Kind.TAG_REMOVED, {"name": found.name}) for found in removed),
    ]


@dataclass(frozen=True)
class SidebarTag:
    """A Tag as the sidebar lists it, with its Task counts."""

    tag: Tag
    open_count: int
    task_count: int


def _counts_by_tag(tasks: QuerySet[Task]) -> dict[int, int]:
    return dict(
        tasks.filter(tags__isnull=False)
        .values("tags")
        .annotate(count=Count("pk"))
        .values_list("tags", "count"),
    )


def sidebar_tags(user: User) -> list[SidebarTag]:
    """Return the user's Tags in order, each with its open and total Task counts.

    The open count leaves out archived Projects, like every view that spans Projects. The total
    counts every Task that isn't in Trash, because that's how many merging or deleting touches.
    """
    open_counts = _counts_by_tag(active_tasks(user).filter(status__in=OPEN_STATUSES))
    totals = _counts_by_tag(live.tasks(user))
    return [
        SidebarTag(
            tag=found, open_count=open_counts.get(found.pk, 0), task_count=totals.get(found.pk, 0)
        )
        for found in user.tags.all()
    ]


def _tagged(tag: Tag) -> QuerySet[Task]:
    return as_rows(active_tasks(tag.owner).filter(tags=tag), tag.owner)


def open_tasks(tag: Tag) -> QuerySet[Task]:
    """Return the Tag's open and Blocked Tasks, Subtasks too, flat: Pinned first, then manual order.

    Tasks in archived Projects are left out. A Subtask shows whatever its parent's Status, so the
    list says which Task it belongs to with its parent's title.
    """
    return _tagged(tag).filter(status__in=OPEN_STATUSES).order_by(unpinned(), "position", "id")


def closed_tasks(tag: Tag, cursor: str | None = None) -> Page[Task]:
    """Return a page of the Tag's Closed Tasks, flat, most recently completed first.

    Raises:
        InvalidCursorError: The cursor wasn't one this function returned.
    """
    return newest_first(_tagged(tag).filter(status__in=CLOSED_STATUSES), "completed_at", cursor)
