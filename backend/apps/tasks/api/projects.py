"""Project endpoints: create, change, move, archive, unarchive and delete a Project."""

from __future__ import annotations

from http import HTTPStatus
from typing import TYPE_CHECKING

from ninja import Router, Status

from apps.core.auth import signed_in_user
from apps.core.schemas import ErrorOut
from apps.tasks import project_trash, projects
from apps.tasks.projects import ProjectEdit
from apps.tasks.schemas.projects import ProjectIn, ProjectMoveIn, ProjectOut, ProjectPatchIn
from apps.tasks.siblings import SiblingRef

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
def create_project(request: HttpRequest, project: ProjectIn) -> Status[ProjectOut]:
    """Create a Project last in its Folder, or last in the sidebar."""
    user = signed_in_user(request)
    folder = None if project.folder_id is None else projects.folder(user, project.folder_id)
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
) -> Status[ProjectOut]:
    """Rename, recolour, change the icon or switch the Layout of a Project.

    The Inbox can't be changed.
    """
    edit = ProjectEdit(name=patch.name, color=patch.color, icon=patch.icon, layout=patch.layout)
    project = projects.update_project(signed_in_user(request), project_id, edit)
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
) -> Status[None]:
    """Put a Project in a Folder or on the top level, right after a sibling or first."""
    user = signed_in_user(request)
    folder = None if move.folder_id is None else projects.folder(user, move.folder_id)
    after = None if move.after is None else SiblingRef(move.after.kind, move.after.id)
    projects.move_project(user, project_id, folder, after)
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
def archive_project(request: HttpRequest, project_id: int) -> Status[ProjectOut]:
    """Make a Project read-only and move it to the sidebar's Archived section."""
    project = projects.archive_project(signed_in_user(request), project_id)
    return Status(HTTPStatus.OK, ProjectOut.from_orm(project))


@router.post(
    "/{int:project_id}/unarchive",
    response={HTTPStatus.OK: ProjectOut, HTTPStatus.NOT_FOUND: ErrorOut},
    summary="Unarchive a Project",
)
def unarchive_project(
    request: HttpRequest,
    project_id: int,
) -> Status[ProjectOut]:
    """Bring an archived Project back to its place in the sidebar, unchanged."""
    project = projects.unarchive_project(signed_in_user(request), project_id)
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
def delete_project(request: HttpRequest, project_id: int) -> Status[None]:
    """Move a Project and its Tasks to Trash as one unit. The Inbox can't be deleted."""
    project_trash.trash_project(signed_in_user(request), project_id)
    return Status(HTTPStatus.NO_CONTENT, None)
