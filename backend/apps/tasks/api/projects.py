"""Project endpoints: create, change, move, archive, unarchive and delete a Project."""

from __future__ import annotations

from http import HTTPStatus
from typing import TYPE_CHECKING

from ninja import Router, Status

from apps.core.auth import signed_in_user
from apps.core.schemas import ErrorOut
from apps.tasks import project_trash, projects
from apps.tasks.api.errors import FOLDER_NOT_FOUND, PROJECT_NOT_FOUND
from apps.tasks.projects import SiblingRef
from apps.tasks.schemas.projects import ProjectIn, ProjectMoveIn, ProjectOut, ProjectPatchIn

if TYPE_CHECKING:
    from django.http import HttpRequest

router = Router()


@router.post(
    "",
    response={
        HTTPStatus.CREATED: ProjectOut,
        HTTPStatus.NOT_FOUND: ErrorOut,
        HTTPStatus.UNPROCESSABLE_ENTITY: ErrorOut,
    },
    summary="Create a Project",
)
def create_project(
    request: HttpRequest, project: ProjectIn
) -> Status[ProjectOut] | Status[ErrorOut]:
    """Create a Project last in its Folder, or last in the sidebar."""
    user = signed_in_user(request)
    folder = None
    if project.folder_id is not None:
        folder = projects.folder(user, project.folder_id)
        if folder is None:
            return Status(HTTPStatus.NOT_FOUND, FOLDER_NOT_FOUND)
    created = projects.create_project(
        user,
        project.name,
        color=project.color,
        icon=project.icon,
        folder=folder,
    )
    return Status(HTTPStatus.CREATED, ProjectOut.from_orm(created))


@router.patch(
    "/{int:project_id}",
    response={
        HTTPStatus.OK: ProjectOut,
        HTTPStatus.NOT_FOUND: ErrorOut,
        HTTPStatus.UNPROCESSABLE_ENTITY: ErrorOut,
    },
    summary="Change a Project",
)
def update_project(
    request: HttpRequest,
    project_id: int,
    patch: ProjectPatchIn,
) -> Status[ProjectOut] | Status[ErrorOut]:
    """Rename, recolour or change the icon of a Project. The Inbox can't be changed."""
    project = projects.update_project(
        signed_in_user(request),
        project_id,
        name=patch.name,
        color=patch.color,
        icon=patch.icon,
    )
    if project is None:
        return Status(HTTPStatus.NOT_FOUND, PROJECT_NOT_FOUND)
    return Status(HTTPStatus.OK, ProjectOut.from_orm(project))


@router.post(
    "/{int:project_id}/move",
    response={
        HTTPStatus.NO_CONTENT: None,
        HTTPStatus.NOT_FOUND: ErrorOut,
        HTTPStatus.UNPROCESSABLE_ENTITY: ErrorOut,
    },
    summary="Move a Project in the sidebar",
)
def move_project(
    request: HttpRequest,
    project_id: int,
    move: ProjectMoveIn,
) -> Status[None] | Status[ErrorOut]:
    """Put a Project in a Folder or on the top level, right after a sibling or first."""
    user = signed_in_user(request)
    folder = None
    if move.folder_id is not None:
        folder = projects.folder(user, move.folder_id)
        if folder is None:
            return Status(HTTPStatus.NOT_FOUND, FOLDER_NOT_FOUND)
    after = None if move.after is None else SiblingRef(move.after.kind, move.after.id)
    moved = projects.move_project(user, project_id, folder, after)
    if not moved:
        return Status(HTTPStatus.NOT_FOUND, PROJECT_NOT_FOUND)
    return Status(HTTPStatus.NO_CONTENT, None)


@router.post(
    "/{int:project_id}/archive",
    response={
        HTTPStatus.OK: ProjectOut,
        HTTPStatus.NOT_FOUND: ErrorOut,
        HTTPStatus.UNPROCESSABLE_ENTITY: ErrorOut,
    },
    summary="Archive a Project",
)
def archive_project(request: HttpRequest, project_id: int) -> Status[ProjectOut] | Status[ErrorOut]:
    """Make a Project read-only and move it to the sidebar's Archived section."""
    project = projects.archive_project(signed_in_user(request), project_id)
    if project is None:
        return Status(HTTPStatus.NOT_FOUND, PROJECT_NOT_FOUND)
    return Status(HTTPStatus.OK, ProjectOut.from_orm(project))


@router.post(
    "/{int:project_id}/unarchive",
    response={HTTPStatus.OK: ProjectOut, HTTPStatus.NOT_FOUND: ErrorOut},
    summary="Unarchive a Project",
)
def unarchive_project(
    request: HttpRequest,
    project_id: int,
) -> Status[ProjectOut] | Status[ErrorOut]:
    """Bring an archived Project back to its place in the sidebar, unchanged."""
    project = projects.unarchive_project(signed_in_user(request), project_id)
    if project is None:
        return Status(HTTPStatus.NOT_FOUND, PROJECT_NOT_FOUND)
    return Status(HTTPStatus.OK, ProjectOut.from_orm(project))


@router.delete(
    "/{int:project_id}",
    response={
        HTTPStatus.NO_CONTENT: None,
        HTTPStatus.NOT_FOUND: ErrorOut,
        HTTPStatus.UNPROCESSABLE_ENTITY: ErrorOut,
    },
    summary="Move a Project to Trash",
)
def delete_project(request: HttpRequest, project_id: int) -> Status[None] | Status[ErrorOut]:
    """Move a Project and its Tasks to Trash as one unit. The Inbox can't be deleted."""
    trashed = project_trash.trash_project(signed_in_user(request), project_id)
    if not trashed:
        return Status(HTTPStatus.NOT_FOUND, PROJECT_NOT_FOUND)
    return Status(HTTPStatus.NO_CONTENT, None)
