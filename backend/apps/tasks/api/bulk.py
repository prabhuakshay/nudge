"""The endpoint behind the "N selected" bar: one action for several Tasks at once."""

from __future__ import annotations

from http import HTTPStatus
from typing import TYPE_CHECKING

from ninja import Router, Status

from apps.core.auth import signed_in_user
from apps.core.schemas import ErrorOut
from apps.tasks import bulk, services, tags
from apps.tasks.dates import TaskDates
from apps.tasks.schemas.bulk import (
    BulkAction,
    BulkDatesIn,
    BulkDeleteIn,
    BulkMoveIn,
    BulkPlaceIn,
    BulkPriorityIn,
    BulkStatusesIn,
    BulkStatusIn,
    BulkTagIn,
    TaskBulkIn,
    TaskBulkOut,
    TaskPlace,
)
from apps.tasks.schemas.tasks import AffectedTaskOut

if TYPE_CHECKING:
    from django.http import HttpRequest

    from apps.accounts.models import User
    from apps.tasks.tree import AffectedTask

router = Router()

_NOT_FOUND = ErrorOut(detail="Not every task, project or tag given was found.")

# Every action but a move, which reports where the Tasks were as well.
_Change = (
    BulkStatusIn
    | BulkStatusesIn
    | BulkPlaceIn
    | BulkPriorityIn
    | BulkDatesIn
    | BulkTagIn
    | BulkDeleteIn
)


@router.post(
    "/tasks/bulk",
    response={
        HTTPStatus.OK: TaskBulkOut,
        HTTPStatus.NOT_FOUND: ErrorOut,
        HTTPStatus.UNPROCESSABLE_ENTITY: ErrorOut,
    },
    summary="Change several Tasks at once",
)
def bulk_change(
    request: HttpRequest, payload: TaskBulkIn
) -> Status[TaskBulkOut] | Status[ErrorOut]:
    """Apply one action to every Task given, in one transaction.

    Each Task changes as it would on its own, cascades and Activity included. If any id isn't one
    of the user's Tasks, or the Project or Tag isn't theirs, nothing changes and the answer is
    404; if any Task refuses the change, nothing changes and the answer is 422. Every Task whose
    Status changed comes back with its Status from before, and a move says where each Task was,
    so the client can offer Undo.
    """
    out = _run(signed_in_user(request), payload.ids, payload.action)
    if out is None:
        return Status(HTTPStatus.NOT_FOUND, _NOT_FOUND)
    return Status(HTTPStatus.OK, out)


def _run(user: User, ids: list[int], action: BulkAction) -> TaskBulkOut | None:
    """Do the action; return what it changed, or None if something wasn't found."""
    if isinstance(action, BulkMoveIn):
        project = services.live_project(user, action.project_id)
        moved = None if project is None else bulk.move_tasks(user, ids, project)
        if moved is None:
            return None
        places = [TaskPlace.from_orm(place) for place in moved.moved_from]
        return TaskBulkOut(affected=_affected_out(moved.affected), moved_from=places)
    affected = _change(user, ids, action)
    return (
        None if affected is None else TaskBulkOut(affected=_affected_out(affected), moved_from=[])
    )


def _affected_out(affected: list[AffectedTask]) -> list[AffectedTaskOut]:
    return [AffectedTaskOut.from_orm(task) for task in affected]


def _change(
    user: User,
    ids: list[int],
    action: _Change,
) -> list[AffectedTask] | None:
    """Do an action other than a move; return the Tasks whose Status changed, or None."""
    if isinstance(action, BulkDeleteIn):
        return [] if bulk.trash_tasks(user, ids) else None
    if isinstance(action, BulkStatusesIn | BulkPlaceIn):
        return _per_task(user, action)
    if isinstance(action, BulkTagIn):
        return _tag(user, ids, action)
    return bulk.update_tasks(user, ids, _edit(action))


def _per_task(user: User, action: BulkStatusesIn | BulkPlaceIn) -> list[AffectedTask] | None:
    """Give each Task its own Status or place, in order; None if a Task or place isn't found."""
    if isinstance(action, BulkStatusesIn):
        statuses = [
            bulk.TaskStatus(entry.id, entry.status, entry.blocked_reason)
            for entry in action.statuses
        ]
        return bulk.set_statuses(user, statuses)
    places = [
        bulk.Place(entry.id, entry.project_id, entry.parent_id, entry.after_id, entry.section_id)
        for entry in action.places
    ]
    return bulk.place_tasks(user, places)


def _tag(user: User, ids: list[int], action: BulkTagIn) -> list[AffectedTask] | None:
    """Put the Tag on the Tasks or take it off; None if the Tag or a Task isn't the user's."""
    tag = tags.tag(user, action.tag_id)
    if tag is None or not bulk.tag_tasks(user, ids, tag, add=action.kind == "add_tag"):
        return None
    return []


def _edit(action: BulkStatusIn | BulkPriorityIn | BulkDatesIn) -> services.TaskEdit:
    """Return the edit the action makes to each Task."""
    if isinstance(action, BulkStatusIn):
        return services.TaskEdit(status=action.status)
    if isinstance(action, BulkPriorityIn):
        return services.TaskEdit(priority=action.priority)
    dates = action.dates
    return services.TaskEdit(
        dates=TaskDates(dates.due_date, dates.due_time, dates.start_date, dates.start_time),
    )
