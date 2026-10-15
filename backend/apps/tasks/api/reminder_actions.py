"""Reminder actions: complete or snooze a Task from the Notification its Reminder sent."""

from __future__ import annotations

from typing import TYPE_CHECKING

from ninja import Router, Status

from apps.core.auth import signed_in_user
from apps.core.schemas import ErrorOut
from apps.tasks import reminder_actions
from apps.tasks.api.tasks import task_change_out
from apps.tasks.schemas.reminders import SnoozeIn  # noqa: TC001 - Ninja reads the type at runtime
from apps.tasks.schemas.tasks import TaskChangeOut

if TYPE_CHECKING:
    from django.http import HttpRequest

router = Router()

_HTTP_OK = 200
_HTTP_NO_CONTENT = 204
_HTTP_NOT_FOUND = 404
_HTTP_UNPROCESSABLE = 422
_NOT_FOUND = ErrorOut(detail="Reminder notification not found.")


@router.post(
    "/{int:notification_id}/complete",
    response={_HTTP_OK: TaskChangeOut, _HTTP_NOT_FOUND: ErrorOut, _HTTP_UNPROCESSABLE: ErrorOut},
    summary="Complete a Task from its Reminder",
)
def complete(
    request: HttpRequest,
    notification_id: int,
) -> Status[TaskChangeOut] | Status[ErrorOut]:
    """Complete the Task a Reminder notification is about, as ticking it off would."""
    change = reminder_actions.complete(signed_in_user(request), notification_id)
    if change is None:
        return Status(_HTTP_NOT_FOUND, _NOT_FOUND)
    return Status(_HTTP_OK, task_change_out(change))


@router.post(
    "/{int:notification_id}/snooze",
    response={_HTTP_NO_CONTENT: None, _HTTP_NOT_FOUND: ErrorOut},
    summary="Snooze a Reminder",
)
def snooze(
    request: HttpRequest,
    notification_id: int,
    body: SnoozeIn,
) -> Status[None] | Status[ErrorOut]:
    """Fire a Reminder notification once more later, leaving its Task as it is."""
    if not reminder_actions.snooze(signed_in_user(request), notification_id, body.until):
        return Status(_HTTP_NOT_FOUND, _NOT_FOUND)
    return Status(_HTTP_NO_CONTENT, None)
