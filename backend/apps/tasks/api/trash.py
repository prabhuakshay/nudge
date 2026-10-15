"""Trash endpoints: list what was deleted and restore it.

Deleting is `DELETE /tasks/{id}` or `DELETE /projects/{id}`.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from ninja import Router, Status

from apps.accounts.schemas import ErrorOut
from apps.tasks import project_trash, trash
from apps.tasks.api import signed_in_user
from apps.tasks.schemas.projects import ProjectOut
from apps.tasks.schemas.tasks import TaskOut
from apps.tasks.schemas.trash import (
    TaskRestoreOut,
    TrashedOut,
    TrashedProjectOut,
    TrashedTaskOut,
)

if TYPE_CHECKING:
    from django.http import HttpRequest

router = Router()

_HTTP_OK = 200
_HTTP_NOT_FOUND = 404
_TASK_NOT_FOUND = ErrorOut(detail="Task not found in Trash.")
_PROJECT_NOT_FOUND = ErrorOut(detail="Project not found in Trash.")


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
    "/projects/{int:project_id}/restore",
    response={_HTTP_OK: ProjectOut, _HTTP_NOT_FOUND: ErrorOut},
    summary="Restore a Project from Trash",
)
def restore_project(
    request: HttpRequest,
    project_id: int,
) -> Status[ProjectOut] | Status[ErrorOut]:
    """Bring back a Project with its Tasks, renamed "<Name> (2)" if its name was taken."""
    project = project_trash.restore_project(signed_in_user(request), project_id)
    if project is None:
        return Status(_HTTP_NOT_FOUND, _PROJECT_NOT_FOUND)
    return Status(_HTTP_OK, ProjectOut.from_orm(project))
