"""Business rules for Tags: naming, order, putting them on Tasks, merging and deleting them.

Tags are flat and ordered by fractional-indexing keys the server generates; the client only says
which Tag one now follows. Writes to the order lock the user's row, so two concurrent moves never
produce the same key. A Tag's name is unique per user whatever its case, so a name typed in Quick
add finds the Tag the user already has.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Literal

from django.db import IntegrityError, transaction
from django.db.models import Count, Q
from fractional_indexing import generate_key_between

from apps.accounts.models import User
from apps.tasks.models import OPEN_STATUSES, Tag, Task, TaskActivity

if TYPE_CHECKING:
    from collections.abc import Iterable

    from django.db.models import QuerySet

    from apps.core.palette import PaletteColor


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


def retag(task: Task, tags: list[Tag]) -> list[TaskActivity]:
    """Give the Task exactly these Tags; return unsaved Activity events, one per change.

    Call it inside the transaction that saves the events.
    """
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


def sidebar_tags(user: User) -> QuerySet[Tag]:
    """Return the user's Tags in order, each with `open_count` and `task_count` annotated.

    `task_count` counts every Task that isn't in Trash, closed ones too, because that's how many
    Tasks merging or deleting the Tag touches.
    """
    in_use = Q(tasks__deleted_at__isnull=True, tasks__project__deleted_at__isnull=True)
    return user.tags.annotate(
        open_count=Count("tasks", filter=in_use & Q(tasks__status__in=OPEN_STATUSES)),
        task_count=Count("tasks", filter=in_use),
    ).order_by("position", "id")
