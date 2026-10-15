"""Folder endpoints: create one, rename or collapse it, move it and delete it."""

from __future__ import annotations

from typing import TYPE_CHECKING

from ninja import Router, Status

from apps.core.auth import signed_in_user
from apps.core.schemas import ErrorOut
from apps.tasks import projects
from apps.tasks.projects import SiblingRef
from apps.tasks.schemas.projects import FolderIn, FolderMoveIn, FolderOut, FolderPatchIn

if TYPE_CHECKING:
    from django.http import HttpRequest

router = Router()

_HTTP_OK = 200
_HTTP_CREATED = 201
_HTTP_NO_CONTENT = 204
_HTTP_NOT_FOUND = 404
_FOLDER_NOT_FOUND = ErrorOut(detail="Folder not found.")


@router.post("", response={_HTTP_CREATED: FolderOut}, summary="Create a Folder")
def create_folder(request: HttpRequest, folder: FolderIn) -> Status[FolderOut]:
    """Create an expanded Folder last in the sidebar."""
    created = projects.create_folder(signed_in_user(request), folder.name)
    return Status(_HTTP_CREATED, FolderOut.from_orm(created))


@router.patch(
    "/{int:folder_id}",
    response={_HTTP_OK: FolderOut, _HTTP_NOT_FOUND: ErrorOut},
    summary="Change a Folder",
)
def update_folder(
    request: HttpRequest,
    folder_id: int,
    patch: FolderPatchIn,
) -> Status[FolderOut] | Status[ErrorOut]:
    """Rename a Folder, or collapse or expand it."""
    folder = projects.update_folder(
        signed_in_user(request),
        folder_id,
        name=patch.name,
        collapsed=patch.collapsed,
    )
    if folder is None:
        return Status(_HTTP_NOT_FOUND, _FOLDER_NOT_FOUND)
    return Status(_HTTP_OK, FolderOut.from_orm(folder))


@router.post(
    "/{int:folder_id}/move",
    response={_HTTP_NO_CONTENT: None, _HTTP_NOT_FOUND: ErrorOut},
    summary="Move a Folder in the sidebar",
)
def move_folder(
    request: HttpRequest,
    folder_id: int,
    move: FolderMoveIn,
) -> Status[None] | Status[ErrorOut]:
    """Put a Folder right after a top-level sibling, or first."""
    after = None if move.after is None else SiblingRef(move.after.kind, move.after.id)
    if not projects.move_folder(signed_in_user(request), folder_id, after):
        return Status(_HTTP_NOT_FOUND, _FOLDER_NOT_FOUND)
    return Status(_HTTP_NO_CONTENT, None)


@router.delete(
    "/{int:folder_id}",
    response={_HTTP_NO_CONTENT: None, _HTTP_NOT_FOUND: ErrorOut},
    summary="Delete a Folder",
)
def delete_folder(request: HttpRequest, folder_id: int) -> Status[None] | Status[ErrorOut]:
    """Delete a Folder for good; its Projects stay, ungrouped, where it was."""
    if not projects.delete_folder(signed_in_user(request), folder_id):
        return Status(_HTTP_NOT_FOUND, _FOLDER_NOT_FOUND)
    return Status(_HTTP_NO_CONTENT, None)
