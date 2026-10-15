"""Changing several Tasks at once, as the "N selected" bar does.

Each change runs the single-Task rule for every Task, so cascades, Repeat and Activity behave
exactly as when the Tasks are changed one by one, and all of it happens in one transaction: one
refused Task leaves every Task as it was. A Task whose ancestor is also given travels with that
ancestor when it moves or goes to Trash, rather than leaving its tree.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from django.db import transaction
from django.db.models import Q

from apps.tasks import moves, services, tags, trash
from apps.tasks.models import Task
from apps.tasks.tree import ancestors

if TYPE_CHECKING:
    from collections.abc import Iterable

    from apps.accounts.models import User
    from apps.tasks.models import Project, Tag
    from apps.tasks.tree import AffectedTask


@dataclass(frozen=True)
class TaskStatus:
    """The Status, and Blocked reason, to give one Task."""

    id: int
    status: Task.Status
    blocked_reason: str = ""


@dataclass(frozen=True)
class Place:
    """Where a Task sits: its Project, its parent (None at the top) and the sibling before it."""

    id: int
    project_id: int
    parent_id: int | None
    after_id: int | None


@dataclass(frozen=True)
class Moved:
    """What a bulk move did: the Tasks whose Status it changed, and where each moved Task was."""

    affected: list[AffectedTask]
    moved_from: list[Place]


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


def _place_of(task: Task) -> Place:
    """Return where the Task sits now."""
    siblings = Task.objects.filter(project_id=task.project_id, parent_id=task.parent_id)
    before = siblings.filter(
        Q(position__lt=task.position) | Q(position=task.position, pk__lt=task.pk),
    ).order_by("-position", "-id")
    return Place(
        task.pk,
        task.project_id,
        task.parent_id,
        before.values_list("pk", flat=True).first(),
    )


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
        affected: list[AffectedTask] = []
        for task in tasks:
            change = services.update_task(user, task.pk, edit)
            affected.extend(change.affected if change else [])
    return affected


def move_tasks(user: User, ids: Iterable[int], project: Project) -> Moved | None:
    """Move each of the user's Tasks first into the Project; None, changing nothing, if any isn't.

    A Subtask moved without its parent becomes a root there. The places the Tasks left come back
    in their old order, so placing them back in that order puts each after the sibling it had.

    Raises:
        TaskRuleError, ArchivedProjectError: as `services.update_task` does for any one of them.
    """
    with transaction.atomic():
        tasks = _owned(user, ids)
        if tasks is None:
            return None
        tops = _tops(tasks)
        moved_from = [_place_of(task) for task in sorted(tops, key=lambda t: (t.position, t.pk))]
        affected: list[AffectedTask] = []
        for task in tops:
            change = services.update_task(user, task.pk, services.TaskEdit(project=project))
            affected.extend(change.affected if change else [])
    return Moved(affected, moved_from)


def place_tasks(user: User, places: list[Place]) -> list[AffectedTask] | None:
    """Put each of the user's Tasks in its place, in order; None, changing nothing, if any isn't.

    Undo of a bulk move uses this to put every Task back where it was.

    Returns:
        Every Task whose Status changed, with its Status from before.

    Raises:
        TaskRuleError, ArchivedProjectError: as `moves.move_task` does for any one of the Tasks.
    """
    with transaction.atomic():
        found = [_destination(user, place) for place in places]
        destinations = [destination for destination in found if destination is not None]
        if _owned(user, (place.id for place in places)) is None or len(destinations) < len(found):
            return None
        affected: list[AffectedTask] = []
        for place, destination in zip(places, destinations, strict=True):
            # Read each Task afresh: placing an earlier one can change it, as by reopening it.
            task = user.tasks.get(pk=place.id)
            affected.extend(moves.move_task(task, destination).affected)
    return affected


def _destination(user: User, place: Place) -> moves.Destination | None:
    """Resolve a place to the user's Project and parent; None if either isn't theirs."""
    project = services.live_project(user, place.project_id)
    parent = None if place.parent_id is None else services.live_task(user, place.parent_id)
    if project is None or (place.parent_id is not None and parent is None):
        return None
    return moves.Destination(project, parent, place.after_id)


def set_statuses(user: User, statuses: list[TaskStatus]) -> list[AffectedTask] | None:
    """Give each of the user's Tasks its own Status, in order; None, changing nothing, if any isn't.

    Undo of a cascade uses this to put every Task it touched back at once.

    Returns:
        Every Task whose Status changed, with its Status from before.

    Raises:
        TaskRuleError, RepeatRuleError, ArchivedProjectError: as `services.update_task` does for
            any one of the Tasks.
    """
    with transaction.atomic():
        if _owned(user, (entry.id for entry in statuses)) is None:
            return None
        affected: list[AffectedTask] = []
        for entry in statuses:
            edit = services.TaskEdit(status=entry.status, blocked_reason=entry.blocked_reason)
            change = services.update_task(user, entry.id, edit)
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
