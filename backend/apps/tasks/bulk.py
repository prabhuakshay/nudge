"""Changing several Tasks at once, as the "N selected" bar does.

Each change runs the single-Task rule for every Task, so cascades, Repeat and Activity behave
exactly as when the Tasks are changed one by one, and all of it happens in one transaction: one
refused Task leaves every Task as it was. A Task whose ancestor is also given travels with that
ancestor when it moves or goes to Trash, rather than leaving its tree.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from django.db import transaction

from apps.tasks import services, tags, trash
from apps.tasks.tree import ancestors

if TYPE_CHECKING:
    from collections.abc import Iterable

    from apps.accounts.models import User
    from apps.tasks.models import Tag, Task
    from apps.tasks.tree import AffectedTask


def _owned(user: User, ids: Iterable[int]) -> list[Task] | None:
    """Return the user's live Tasks with these ids, in the order given; None if any isn't one."""
    wanted = list(dict.fromkeys(ids))
    found = user.tasks.filter(pk__in=wanted, deleted_at__isnull=True).in_bulk()
    if len(found) != len(wanted):
        return None
    return [found[pk] for pk in wanted]


def _tops(tasks: list[Task]) -> list[Task]:
    """Return the Tasks none of whose ancestors is among them."""
    given = {task.pk for task in tasks}
    return [task for task in tasks if given.isdisjoint(above.pk for above in ancestors(task))]


def update_tasks(
    user: User, ids: Iterable[int], edit: services.TaskEdit
) -> list[AffectedTask] | None:
    """Apply the edit to each of the user's Tasks; None, changing nothing, if any isn't theirs.

    Returns every Task whose Status changed, with its Status from before, for Undo.

    Raises:
        TaskRuleError, ReminderRuleError, RepeatRuleError, ArchivedProjectError: as
            `services.update_task` does for any one of the Tasks.
    """
    with transaction.atomic():
        tasks = _owned(user, ids)
        if tasks is None:
            return None
        if edit.project is not None:
            tasks = _tops(tasks)
        affected: list[AffectedTask] = []
        for task in tasks:
            change = services.update_task(user, task.pk, edit)
            affected.extend(change.affected if change else [])
    return affected


def tag_tasks(user: User, ids: Iterable[int], tag: Tag, *, add: bool) -> bool:
    """Put the Tag on each of the user's Tasks, or take it off; False if any isn't theirs.

    Raises:
        ArchivedProjectError: A Task is in an archived Project.
    """
    with transaction.atomic():
        tasks = _owned(user, ids)
        if tasks is None:
            return False
        for task in tasks:
            current = [found for found in task.tags.all() if found != tag]
            wanted = [*current, tag] if add else current
            tags.update_tagged_task(user, task.pk, services.TaskEdit(), wanted)
    return True


def trash_tasks(user: User, ids: Iterable[int]) -> bool:
    """Send each of the user's Tasks to Trash with its Subtasks; False if any isn't theirs.

    Raises:
        ArchivedProjectError: A Task is in an archived Project.
    """
    with transaction.atomic():
        tasks = _owned(user, ids)
        if tasks is None:
            return False
        for task in _tops(tasks):
            trash.trash_task(user, task.pk)
    return True
