"""Reminder actions: complete or snooze a Task from the Notification its Reminder sent."""

from __future__ import annotations

from http import HTTPStatus
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


@router.post(
    "/{int:notification_id}/complete",
    response={
        HTTPStatus.OK: TaskChangeOut,
        HTTPStatus.NOT_FOUND: ErrorOut,
        HTTPStatus.UNPROCESSABLE_ENTITY: ErrorOut,
    },
    summary="Complete a Task from its Reminder",
)
def complete(
    request: HttpRequest,
    notification_id: int,
) -> Status[TaskChangeOut]:
    """Complete the Task a Reminder notification is about, as ticking it off would."""
    change = reminder_actions.complete(signed_in_user(request), notification_id)
    return Status(HTTPStatus.OK, task_change_out(change))


@router.post(
    "/{int:notification_id}/snooze",
    response={HTTPStatus.NO_CONTENT: None, HTTPStatus.NOT_FOUND: ErrorOut},
    summary="Snooze a Reminder",
)
def snooze(
    request: HttpRequest,
    notification_id: int,
    body: SnoozeIn,
) -> Status[None]:
    """Fire a Reminder notification once more later, leaving its Task as it is."""
    reminder_actions.snooze(signed_in_user(request), notification_id, body.until)
    return Status(HTTPStatus.NO_CONTENT, None)
