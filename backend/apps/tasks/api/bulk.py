"""The endpoint behind the "N selected" bar: one action for several Tasks at once."""

from __future__ import annotations

from typing import TYPE_CHECKING

from ninja import Router, Status

from apps.accounts.schemas import ErrorOut
from apps.tasks import bulk, services, tags
from apps.tasks.api import signed_in_user
from apps.tasks.archive import ArchivedProjectError
from apps.tasks.dates import TaskDates
from apps.tasks.reminders import ReminderRuleError
from apps.tasks.repeat import RepeatRuleError
from apps.tasks.schemas.bulk import (
    BulkAction,
    BulkDatesIn,
    BulkDeleteIn,
    BulkMoveIn,
    BulkPriorityIn,
    BulkStatusesIn,
    BulkStatusIn,
    BulkTagIn,
    TaskBulkIn,
    TaskBulkOut,
)
from apps.tasks.schemas.tasks import AffectedTaskOut

if TYPE_CHECKING:
    from django.http import HttpRequest

    from apps.accounts.models import User
    from apps.tasks.tree import AffectedTask

router = Router()

_HTTP_OK = 200
_HTTP_NOT_FOUND = 404
_HTTP_UNPROCESSABLE = 422
_NOT_FOUND = ErrorOut(detail="Not every task, project or tag given was found.")


@router.post(
    "/tasks/bulk",
    response={_HTTP_OK: TaskBulkOut, _HTTP_NOT_FOUND: ErrorOut, _HTTP_UNPROCESSABLE: ErrorOut},
    summary="Change several Tasks at once",
)
def bulk_change(
    request: HttpRequest, payload: TaskBulkIn
) -> Status[TaskBulkOut] | Status[ErrorOut]:
    """Apply one action to every Task given, in one transaction.

    Each Task changes as it would on its own, cascades and Activity included. If any id isn't one
    of the user's Tasks, or the Project or Tag isn't theirs, nothing changes and the answer is
    404; if any Task refuses the change, nothing changes and the answer is 422. Every Task whose
    Status changed comes back with its Status from before, so the client can offer Undo.
    """
    try:
        affected = _run(signed_in_user(request), payload.ids, payload.action)
    except (
        services.TaskRuleError,
        ReminderRuleError,
        RepeatRuleError,
        ArchivedProjectError,
    ) as error:
        return Status(_HTTP_UNPROCESSABLE, ErrorOut(detail=str(error)))
    if affected is None:
        return Status(_HTTP_NOT_FOUND, _NOT_FOUND)
    return Status(
        _HTTP_OK, TaskBulkOut(affected=[AffectedTaskOut.from_orm(task) for task in affected])
    )


def _run(user: User, ids: list[int], action: BulkAction) -> list[AffectedTask] | None:
    """Do the action; return the Tasks whose Status changed, or None if something wasn't found."""
    if isinstance(action, BulkDeleteIn):
        return [] if bulk.trash_tasks(user, ids) else None
    if isinstance(action, BulkStatusesIn):
        statuses = [
            bulk.TaskStatus(entry.id, entry.status, entry.blocked_reason)
            for entry in action.statuses
        ]
        return bulk.set_statuses(user, statuses)
    if isinstance(action, BulkTagIn):
        return _tag(user, ids, action)
    edit = _edit(user, action)
    return None if edit is None else bulk.update_tasks(user, ids, edit)


def _tag(user: User, ids: list[int], action: BulkTagIn) -> list[AffectedTask] | None:
    """Put the Tag on the Tasks or take it off; None if the Tag or a Task isn't the user's."""
    tag = tags.tag(user, action.tag_id)
    if tag is None or not bulk.tag_tasks(user, ids, tag, add=action.kind == "add_tag"):
        return None
    return []


def _edit(
    user: User,
    action: BulkMoveIn | BulkStatusIn | BulkPriorityIn | BulkDatesIn,
) -> services.TaskEdit | None:
    """Return the edit the action makes to each Task, or None for another user's Project."""
    if isinstance(action, BulkStatusIn):
        return services.TaskEdit(status=action.status)
    if isinstance(action, BulkPriorityIn):
        return services.TaskEdit(priority=action.priority)
    if isinstance(action, BulkDatesIn):
        dates = action.dates
        return services.TaskEdit(
            dates=TaskDates(dates.due_date, dates.due_time, dates.start_date, dates.start_time),
        )
    project = services.live_project(user, action.project_id)
    return None if project is None else services.TaskEdit(project=project)
