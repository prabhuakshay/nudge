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
from fractional_indexing import generate_key_between

from apps.accounts.models import User
from apps.tasks import repeat, services
from apps.tasks.archive import active_tasks
from apps.tasks.models import CLOSED_STATUSES, OPEN_STATUSES, Project, Tag, Task, TaskActivity
from apps.tasks.pagination import Page, newest_first
from apps.tasks.rows import as_rows

if TYPE_CHECKING:
    from collections.abc import Iterable

    from django.db.models import QuerySet

    from apps.core.palette import PaletteColor
    from apps.tasks.dates import TaskDates


class TagRuleError(Exception):
    """A change to a Tag breaks one of the rules Tags follow."""


def _lock_order(user: User) -> None:
    User.objects.select_for_update().get(pk=user.pk)


def _name_taken(name: str) -> TagRuleError:
    return TagRuleError(f"You already have a Tag named “{name}”.")


def _save(tag: Tag) -> None:
    """Save the Tag, turning a clash with another of the user's names into a rule error."""
    try:
        with transaction.atomic():
            tag.save()
    except IntegrityError as error:
        raise _name_taken(tag.name) from error


def tag(user: User, tag_id: int) -> Tag | None:
    """Return one of the user's Tags, or None."""
    return user.tags.filter(pk=tag_id).first()


def owned_tags(user: User, tag_ids: Iterable[int]) -> list[Tag] | None:
    """Return the user's Tags with these ids, or None if any of them isn't the user's."""
    wanted = set(tag_ids)
    found = list(user.tags.filter(pk__in=wanted))
    return found if len(found) == len(wanted) else None


def _last_key(user: User) -> str:
    last = user.tags.order_by("-position", "-id").values_list("position", flat=True).first()
    return str(generate_key_between(last, None))


def create_tag(user: User, name: str, *, color: PaletteColor | None = None) -> Tag:
    """Create a Tag last in the user's order; grey when no colour is given.

    Raises:
        TagRuleError: The user already has a Tag of that name.
    """
    with transaction.atomic():
        _lock_order(user)
        created = Tag(owner=user, name=name, color=color or "", position=_last_key(user))
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
) -> Tag | None:
    """Rename or recolour one of the user's Tags; None if it isn't theirs. "" makes it grey.

    Raises:
        TagRuleError: Another of the user's Tags has that name.
    """
    found = tag(user, tag_id)
    if found is None:
        return None
    found.name = name if name is not None else found.name
    found.color = color if color is not None else found.color
    _save(found)
    return found


def move_tag(user: User, tag_id: int, after_id: int | None) -> bool:
    """Put one of the user's Tags right after another; first for None, last if it isn't theirs.

    Returns False when the Tag isn't the user's.
    """
    found = tag(user, tag_id)
    if found is None:
        return False
    if after_id == found.pk:
        return True
    with transaction.atomic():
        _lock_order(user)
        keys = list(user.tags.exclude(pk=found.pk).values_list("pk", "position"))
        ids = [pk for pk, _ in keys]
        if after_id is None:
            before, following = None, keys[0][1] if keys else None
        elif after_id in ids:
            index = ids.index(after_id)
            before = keys[index][1]
            following = keys[index + 1][1] if index + 1 < len(keys) else None
        else:
            before, following = keys[-1][1] if keys else None, None
        found.position = str(generate_key_between(before, following))
        found.save(update_fields=["position", "updated_at"])
    return True


def delete_tag(user: User, tag_id: int) -> bool:
    """Delete one of the user's Tags for good, recording its removal on each of its Tasks.

    Returns False when the Tag isn't the user's.
    """
    found = tag(user, tag_id)
    if found is None:
        return False
    with transaction.atomic():
        TaskActivity.objects.bulk_create(
            _event(task, TaskActivity.Kind.TAG_REMOVED, {"name": found.name})
            for task in found.tasks.all()
        )
        found.delete()
    return True


def merge_tag(user: User, tag_id: int, into_id: int) -> bool:
    """Move every Task of one of the user's Tags onto another, then delete the first.

    Returns False when either Tag isn't the user's.

    Raises:
        TagRuleError: The two are the same Tag.
    """
    source, target = tag(user, tag_id), tag(user, into_id)
    if source is None or target is None:
        return False
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
    return True


def _event(task: Task, kind: TaskActivity.Kind, data: dict[str, str]) -> TaskActivity:
    return TaskActivity(task=task, kind=kind, data=data)


def _resolve(user: User, tags: Iterable[Tag | str]) -> list[Tag]:
    """Return the Tags given, with each name turned into the user's Tag of that name."""
    given = list(tags)
    names = [tag for tag in given if isinstance(tag, str)]
    return [*(tag for tag in given if isinstance(tag, Tag)), *tags_named(user, names)]


def create_tagged_task(  # noqa: PLR0913 - each field of a new Task past its title is optional
    project: Project,
    title: str,
    dates: TaskDates | None = None,
    *,
    priority: Task.Priority = Task.Priority.NONE,
    tags: Iterable[Tag | str] = (),
    repeat_with: repeat.Repeat | None = None,
) -> Task:
    """Create a Task as `services.create_task` does, with Tags and a Repeat, in one transaction.

    `tags` holds Tags, or names of the owner's Tags, which are created if they're new.

    Raises:
        MentionError: The title mentions a Person who isn't the owner's.
        ArchivedProjectError: The Project is archived.
        RepeatRuleError: The Repeat's rule is unreadable, or the Task has no due date.
    """
    with transaction.atomic():
        task = services.create_task(project, title, dates, priority=priority)
        task.tags.add(*_resolve(project.owner, tags))
        if repeat_with is not None:
            repeat.start(task, repeat_with.rule, Task.RepeatFrom(repeat_with.repeat_from))
    return task


def create_tagged_subtask(
    parent: Task,
    title: str,
    dates: TaskDates | None = None,
    *,
    priority: Task.Priority = Task.Priority.NONE,
    tags: Iterable[Tag | str] = (),
) -> services.TaskChange:
    """Create a Subtask as `services.create_subtask` does, with Tags, in one transaction.

    `tags` holds Tags, or names of the owner's Tags, which are created if they're new.

    Raises:
        TaskRuleError: The parent is already at the deepest level.
        MentionError: The title mentions a Person who isn't the owner's.
        ArchivedProjectError: The parent is in an archived Project.
    """
    with transaction.atomic():
        change = services.create_subtask(parent, title, dates, priority=priority)
        change.task.tags.add(*_resolve(parent.owner, tags))
    # The row came with its Tags prefetched, before these were added.
    fresh = as_rows(Task.objects.filter(pk=change.task.pk), parent.owner).get()
    return services.TaskChange(task=fresh, affected=change.affected)


def update_tagged_task(
    user: User,
    task_id: int,
    edit: services.TaskEdit,
    tags: list[Tag] | None,
) -> services.TaskChange | None:
    """Change a Task as `services.update_task` does and give it exactly `tags`, unless None.

    Both happen in one transaction, and each Tag put on or taken off is logged in Activity.

    Raises:
        TaskRuleError: The edit breaks a Task rule.
        ArchivedProjectError: The Task is in an archived Project, or would move into one.
    """
    with transaction.atomic():
        change = services.update_task(user, task_id, edit)
        if change is not None and tags is not None:
            TaskActivity.objects.bulk_create(_retag(change.task, tags))
    return change


def _retag(task: Task, tags: list[Tag]) -> list[TaskActivity]:
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
    totals = _counts_by_tag(
        user.tasks.filter(deleted_at__isnull=True, project__deleted_at__isnull=True),
    )
    return [
        SidebarTag(
            tag=found, open_count=open_counts.get(found.pk, 0), task_count=totals.get(found.pk, 0)
        )
        for found in user.tags.all()
    ]


def _tagged(tag: Tag) -> QuerySet[Task]:
    return as_rows(active_tasks(tag.owner).filter(tags=tag), tag.owner)


def open_tasks(tag: Tag) -> QuerySet[Task]:
    """Return the Tag's open and Blocked Tasks, Subtasks too, flat and in manual order.

    Tasks in archived Projects are left out. A Subtask shows whatever its parent's Status, so the
    list says which Task it belongs to with its parent's title.
    """
    return _tagged(tag).filter(status__in=OPEN_STATUSES)


def closed_tasks(tag: Tag, cursor: str | None = None) -> Page[Task]:
    """Return a page of the Tag's Closed Tasks, flat, most recently completed first.

    Raises:
        InvalidCursorError: The cursor wasn't one this function returned.
    """
    return newest_first(_tagged(tag).filter(status__in=CLOSED_STATUSES), "completed_at", cursor)
