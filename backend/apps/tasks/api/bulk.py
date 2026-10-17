"""The endpoint behind the "N selected" bar: one action for several Tasks at once."""

from __future__ import annotations

from http import HTTPStatus
from typing import TYPE_CHECKING

from ninja import Router, Status

from apps.core.auth import signed_in_user
from apps.core.schemas import ErrorOut
from apps.tasks import bulk, placement, services
from apps.tasks.dates import TaskDates
from apps.tasks.schemas.bulk import (
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
def bulk_change(request: HttpRequest, payload: TaskBulkIn) -> Status[TaskBulkOut]:
    """Apply one action to every Task given, in one transaction.

    Each Task changes as it would on its own, cascades and Activity included. If any id isn't one
    of the user's Tasks, or the Project, parent, Section or Tag isn't theirs, nothing changes and
    the answer is 404; if any Task refuses the change, nothing changes and the answer is 422.
    Every Task whose Status changed comes back with its Status from before, and a move says where
    each Task was, so the client can offer Undo.
    """
    user, ids, action = signed_in_user(request), payload.ids, payload.action
    if isinstance(action, BulkMoveIn):
        moved = bulk.move_tasks(user, ids, action.project_id)
        places = [TaskPlace.from_orm(place) for place in moved.moved_from]
        return Status(
            HTTPStatus.OK, TaskBulkOut(affected=_affected_out(moved.affected), moved_from=places)
        )
    affected = _change(user, ids, action)
    return Status(HTTPStatus.OK, TaskBulkOut(affected=_affected_out(affected), moved_from=[]))


def _affected_out(affected: list[AffectedTask]) -> list[AffectedTaskOut]:
    return [AffectedTaskOut.from_orm(task) for task in affected]


def _change(user: User, ids: list[int], action: _Change) -> list[AffectedTask]:
    """Do an action other than a move; return the Tasks whose Status changed."""
    if isinstance(action, BulkDeleteIn):
        bulk.trash_tasks(user, ids)
        return []
    if isinstance(action, BulkTagIn):
        bulk.tag_tasks(user, ids, action.tag_id, add=action.kind == "add_tag")
        return []
    if isinstance(action, BulkStatusesIn | BulkPlaceIn):
        return _per_task(user, action)
    return bulk.update_tasks(user, ids, _edit(action))


def _per_task(user: User, action: BulkStatusesIn | BulkPlaceIn) -> list[AffectedTask]:
    """Give each Task its own Status or place, in order."""
    if isinstance(action, BulkStatusesIn):
        statuses = [
            bulk.TaskStatus(entry.id, entry.status, entry.blocked_reason)
            for entry in action.statuses
        ]
        return bulk.set_statuses(user, statuses)
    places = [
        placement.Place(
            entry.id, entry.project_id, entry.parent_id, entry.after_id, entry.section_id
        )
        for entry in action.places
    ]
    return bulk.place_tasks(user, places)


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
