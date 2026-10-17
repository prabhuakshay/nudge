"""Changing several Tasks at once, as the "N selected" bar does.

Each change runs the single-Task rule for every Task, so cascades, Repeat and Activity behave
exactly as when the Tasks are changed one by one, and all of it happens in one transaction: one
refused Task leaves every Task as it was. A Task whose ancestor is also given travels with that
ancestor when it moves or goes to Trash, rather than leaving its tree. Ids resolve as they do for
one Task, so an id that isn't one of the user's live rows raises `NotFoundError` and changes
nothing.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from django.db import transaction

from apps.tasks import live, moves, services, tags, trash
from apps.tasks.siblings import task_siblings
from apps.tasks.tree import ancestors

if TYPE_CHECKING:
    from collections.abc import Iterable

    from apps.accounts.models import User
    from apps.tasks.models import Task
    from apps.tasks.tree import AffectedTask


@dataclass(frozen=True)
class TaskStatus:
    """The Status, and Blocked reason, to give one Task."""

    id: int
    status: Task.Status
    blocked_reason: str = ""


@dataclass(frozen=True)
class Place:
    """Where a Task sits: its Project, parent, the sibling before it and Section.

    `parent_id` is None at the top level, `after_id` when it's first among its siblings, and
    `section_id` in No section and for a Subtask.
    """

    id: int
    project_id: int
    parent_id: int | None
    after_id: int | None
    section_id: int | None


@dataclass(frozen=True)
class Moved:
    """What a bulk move did: the Tasks whose Status it changed, and where each moved Task was."""

    affected: list[AffectedTask]
    moved_from: list[Place]


def _tops(tasks: list[Task]) -> list[Task]:
    """Return the Tasks none of whose ancestors is among them."""
    given = {task.pk for task in tasks}
    return [task for task in tasks if given.isdisjoint(above.pk for above in ancestors(task))]


def _place_of(task: Task) -> Place:
    """Return where the Task sits now."""
    before = task_siblings(task.project_id, task.parent_id).before(task.pk)
    return Place(task.pk, task.project_id, task.parent_id, before, task.section_id)


def update_tasks(user: User, ids: Iterable[int], edit: services.TaskEdit) -> list[AffectedTask]:
    """Apply the edit to each of the user's live Tasks.

    Returns every Task whose Status changed, with its Status from before, for Undo.

    Raises:
        NotFoundError, TaskRuleError, ReminderRuleError, RepeatRuleError, ArchivedProjectError:
            as `services.update_task` does for any one of the Tasks.
    """
    with transaction.atomic():
        affected: list[AffectedTask] = []
        for task in live.tasks_by_id(user, ids):
            affected.extend(services.update_task(user, task.pk, edit).affected)
    return affected


def move_tasks(user: User, ids: Iterable[int], project_id: int) -> Moved:
    """Move each of the user's live Tasks first into the user's Project `project_id`.

    A Subtask moved without its parent becomes a root there. The places the Tasks left come back
    in their old order, so placing them back in that order puts each after the sibling it had.

    Raises:
        NotFoundError, TaskRuleError, ArchivedProjectError: as `services.update_task` does for
            any one of them.
    """
    with transaction.atomic():
        tops = _tops(live.tasks_by_id(user, ids))
        moved_from = [_place_of(task) for task in sorted(tops, key=lambda t: (t.position, t.pk))]
        affected: list[AffectedTask] = []
        edit = services.TaskEdit(project_id=project_id)
        for task in tops:
            affected.extend(services.update_task(user, task.pk, edit).affected)
    return Moved(affected, moved_from)


def place_tasks(user: User, places: list[Place]) -> list[AffectedTask]:
    """Put each of the user's live Tasks in its place, in order.

    Undo of a bulk move uses this to put every Task back where it was.

    Returns:
        Every Task whose Status changed, with its Status from before.

    Raises:
        NotFoundError, TaskRuleError, SectionRuleError, ArchivedProjectError: as
            `moves.move_task` does for any one of the Tasks.
    """
    with transaction.atomic():
        affected: list[AffectedTask] = []
        for place in places:
            destination = moves.Destination(
                place.project_id,
                place.parent_id,
                place.after_id,
                place.section_id,
                section_given=True,
            )
            affected.extend(moves.move_task(user, place.id, destination).affected)
    return affected


def set_statuses(user: User, statuses: list[TaskStatus]) -> list[AffectedTask]:
    """Give each of the user's live Tasks its own Status, in order.

    Undo of a cascade uses this to put every Task it touched back at once.

    Returns:
        Every Task whose Status changed, with its Status from before.

    Raises:
        NotFoundError, TaskRuleError, RepeatRuleError, ArchivedProjectError: as
            `services.update_task` does for any one of the Tasks.
    """
    with transaction.atomic():
        affected: list[AffectedTask] = []
        for entry in statuses:
            edit = services.TaskEdit(status=entry.status, blocked_reason=entry.blocked_reason)
            affected.extend(services.update_task(user, entry.id, edit).affected)
    return affected


def tag_tasks(user: User, ids: Iterable[int], tag_id: int, *, add: bool) -> None:
    """Put the user's Tag `tag_id` on each of the user's live Tasks, or take it off.

    Raises:
        NotFoundError: The Tag or a Task isn't one of the user's.
        ArchivedProjectError: A Task is in an archived Project.
    """
    tag = tags.tag(user, tag_id)
    with transaction.atomic():
        for task in live.tasks_by_id(user, ids):
            current = [found.pk for found in task.tags.all() if found != tag]
            wanted = [*current, tag.pk] if add else current
            services.update_task(user, task.pk, services.TaskEdit(tag_ids=wanted))


def trash_tasks(user: User, ids: Iterable[int]) -> None:
    """Send each of the user's live Tasks to Trash with its Subtasks.

    Raises:
        NotFoundError: A Task isn't one of the user's.
        ArchivedProjectError: A Task is in an archived Project.
    """
    with transaction.atomic():
        for task in _tops(live.tasks_by_id(user, ids)):
            trash.trash_task(user, task.pk)
