"""Trash endpoints: list what was deleted, restore it or delete it for good.

Moving to Trash is `DELETE /tasks/{id}`.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from ninja import Router, Status

from apps.accounts.schemas import ErrorOut
from apps.tasks import purge, trash
from apps.tasks.api import signed_in_user
from apps.tasks.schemas.projects import ProjectOut
from apps.tasks.schemas.tasks import TaskOut
from apps.tasks.schemas.trash import TaskRestoreOut, TrashDeleteIn, TrashedTaskOut

if TYPE_CHECKING:
    from django.http import HttpRequest

router = Router()

_HTTP_OK = 200
_HTTP_NO_CONTENT = 204
_HTTP_NOT_FOUND = 404
_TASK_NOT_FOUND = ErrorOut(detail="Task not found in Trash.")


@router.get("/trash", response=list[TrashedTaskOut], summary="List the Trash")
def list_trash(request: HttpRequest) -> list[TrashedTaskOut]:
    """Return one row per deleted unit, most recently deleted first."""
    tasks = trash.trashed_tasks(signed_in_user(request))
    return [TrashedTaskOut.from_orm(task) for task in tasks]


@router.post(
    "/tasks/{int:task_id}/restore",
    response={_HTTP_OK: TaskRestoreOut, _HTTP_NOT_FOUND: ErrorOut},
    summary="Restore a Task from Trash",
)
def restore_task(request: HttpRequest, task_id: int) -> Status[TaskRestoreOut] | Status[ErrorOut]:
    """Bring back a Task with everything deleted along with it, and say where it went."""
    restored = trash.restore_task(signed_in_user(request), task_id)
    if restored is None:
        return Status(_HTTP_NOT_FOUND, _TASK_NOT_FOUND)
    body = TaskRestoreOut(
        task=TaskOut.from_orm(restored.task),
        project=ProjectOut.from_orm(restored.project),
    )
    return Status(_HTTP_OK, body)


@router.post(
    "/trash/delete",
    response={_HTTP_NO_CONTENT: None, _HTTP_NOT_FOUND: ErrorOut},
    summary="Delete Tasks in Trash forever",
)
def delete_forever(request: HttpRequest, payload: TrashDeleteIn) -> Status[None] | Status[ErrorOut]:
    """Delete the given Trash units for good; nothing goes if any id isn't in the user's Trash."""
    if not purge.delete_forever(signed_in_user(request), payload.task_ids):
        return Status(_HTTP_NOT_FOUND, _TASK_NOT_FOUND)
    return Status(_HTTP_NO_CONTENT, None)


@router.delete("/trash", response={_HTTP_NO_CONTENT: None}, summary="Empty the Trash")
def empty_trash(request: HttpRequest) -> Status[None]:
    """Delete everything in the Trash for good."""
    purge.empty_trash(signed_in_user(request))
    return Status(_HTTP_NO_CONTENT, None)
