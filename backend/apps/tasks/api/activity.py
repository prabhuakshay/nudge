"""The Activity endpoint: a Task's history, a page at a time."""

from __future__ import annotations

from http import HTTPStatus
from typing import TYPE_CHECKING

from ninja import Router, Status

from apps.core.auth import signed_in_user
from apps.core.schemas import ErrorOut
from apps.tasks import services
from apps.tasks.api.errors import TASK_NOT_FOUND
from apps.tasks.schemas.activity import TaskActivityListOut

if TYPE_CHECKING:
    from django.http import HttpRequest

router = Router()


@router.get(
    "/{int:task_id}/activity",
    response={
        HTTPStatus.OK: TaskActivityListOut,
        HTTPStatus.NOT_FOUND: ErrorOut,
        HTTPStatus.UNPROCESSABLE_ENTITY: ErrorOut,
    },
    summary="List a Task's Activity",
)
def list_activity(
    request: HttpRequest,
    task_id: int,
    cursor: str | None = None,
) -> Status[TaskActivityListOut] | Status[ErrorOut]:
    """Return a page of a Task's history, newest first, with the number of events in all."""
    task = services.live_task(signed_in_user(request), task_id)
    if task is None:
        return Status(HTTPStatus.NOT_FOUND, TASK_NOT_FOUND)
    page = services.task_activity(task, cursor)
    activity = TaskActivityListOut.model_validate(
        {
            "items": page.items,
            "next_cursor": page.next_cursor,
            "count": services.activity_count(task),
        },
    )
    return Status(HTTPStatus.OK, activity)
