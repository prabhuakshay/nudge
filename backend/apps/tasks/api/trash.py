"""Trash endpoints: list what was deleted, restore it or delete it for good.

Moving to Trash is `DELETE /tasks/{id}` or `DELETE /projects/{id}`.
"""

from __future__ import annotations

from http import HTTPStatus
from typing import TYPE_CHECKING

from ninja import Router, Status

from apps.core.auth import signed_in_user
from apps.core.schemas import ErrorOut
from apps.tasks import project_trash, purge, trash
from apps.tasks.schemas.projects import ProjectOut
from apps.tasks.schemas.tasks import TaskOut
from apps.tasks.schemas.trash import (
    TaskRestoreOut,
    TrashDeleteIn,
    TrashedOut,
    TrashedProjectOut,
    TrashedTaskOut,
)

if TYPE_CHECKING:
    from django.http import HttpRequest

router = Router()

_TASK_NOT_FOUND = ErrorOut(detail="Task not found in Trash.")
_PROJECT_NOT_FOUND = ErrorOut(detail="Project not found in Trash.")
_NOT_IN_TRASH = ErrorOut(detail="Not everything given is in Trash.")


@router.get("/trash", response=list[TrashedOut], summary="List the Trash")
def list_trash(request: HttpRequest) -> list[TrashedTaskOut | TrashedProjectOut]:
    """Return one row per deleted Task or Project unit, most recently deleted first."""
    user = signed_in_user(request)
    rows: list[TrashedTaskOut | TrashedProjectOut] = [
        *(TrashedTaskOut.from_orm(task) for task in trash.trashed_tasks(user)),
        *(TrashedProjectOut.from_orm(project) for project in project_trash.trashed_projects(user)),
    ]
    return sorted(rows, key=lambda row: row.deleted_at, reverse=True)


@router.post(
    "/tasks/{int:task_id}/restore",
    response={HTTPStatus.OK: TaskRestoreOut, HTTPStatus.NOT_FOUND: ErrorOut},
    summary="Restore a Task from Trash",
)
def restore_task(request: HttpRequest, task_id: int) -> Status[TaskRestoreOut] | Status[ErrorOut]:
    """Bring back a Task with everything deleted along with it, and say where it went."""
    restored = trash.restore_task(signed_in_user(request), task_id)
    if restored is None:
        return Status(HTTPStatus.NOT_FOUND, _TASK_NOT_FOUND)
    body = TaskRestoreOut(
        task=TaskOut.from_orm(restored.task),
        project=ProjectOut.from_orm(restored.project),
    )
    return Status(HTTPStatus.OK, body)


@router.post(
    "/projects/{int:project_id}/restore",
    response={HTTPStatus.OK: ProjectOut, HTTPStatus.NOT_FOUND: ErrorOut},
    summary="Restore a Project from Trash",
)
def restore_project(
    request: HttpRequest,
    project_id: int,
) -> Status[ProjectOut] | Status[ErrorOut]:
    """Bring back a Project with its Tasks, renamed "<Name> (2)" if its name was taken."""
    project = project_trash.restore_project(signed_in_user(request), project_id)
    if project is None:
        return Status(HTTPStatus.NOT_FOUND, _PROJECT_NOT_FOUND)
    return Status(HTTPStatus.OK, ProjectOut.from_orm(project))


@router.post(
    "/trash/delete",
    response={HTTPStatus.NO_CONTENT: None, HTTPStatus.NOT_FOUND: ErrorOut},
    summary="Delete Tasks and Projects in Trash forever",
)
def delete_forever(request: HttpRequest, payload: TrashDeleteIn) -> Status[None] | Status[ErrorOut]:
    """Delete the given Trash units for good; nothing goes if any id isn't in the user's Trash."""
    user = signed_in_user(request)
    if not purge.delete_forever(user, payload.task_ids, payload.project_ids):
        return Status(HTTPStatus.NOT_FOUND, _NOT_IN_TRASH)
    return Status(HTTPStatus.NO_CONTENT, None)


@router.delete("/trash", response={HTTPStatus.NO_CONTENT: None}, summary="Empty the Trash")
def empty_trash(request: HttpRequest) -> Status[None]:
    """Delete everything in the Trash for good."""
    purge.empty_trash(signed_in_user(request))
    return Status(HTTPStatus.NO_CONTENT, None)
