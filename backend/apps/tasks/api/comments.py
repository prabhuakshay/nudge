"""Comment endpoints: list and add a Task's Comments, edit or delete one."""

from __future__ import annotations

from http import HTTPStatus
from typing import TYPE_CHECKING

from ninja import Router, Status

from apps.core.auth import signed_in_user
from apps.core.schemas import ErrorOut
from apps.tasks import comments
from apps.tasks.schemas.comments import CommentIn, CommentOut

if TYPE_CHECKING:
    from django.http import HttpRequest

router = Router()


@router.get(
    "/tasks/{int:task_id}/comments",
    response={HTTPStatus.OK: list[CommentOut], HTTPStatus.NOT_FOUND: ErrorOut},
    summary="List a Task's Comments",
)
def list_comments(
    request: HttpRequest,
    task_id: int,
) -> Status[list[CommentOut]]:
    """Return all of a Task's Comments, oldest first."""
    found = comments.comments(signed_in_user(request), task_id)
    return Status(HTTPStatus.OK, [CommentOut.from_orm(comment) for comment in found])


@router.post(
    "/tasks/{int:task_id}/comments",
    response={
        HTTPStatus.CREATED: CommentOut,
        HTTPStatus.NOT_FOUND: ErrorOut,
        HTTPStatus.UNPROCESSABLE_ENTITY: ErrorOut,
    },
    summary="Comment on a Task",
)
def add_comment(
    request: HttpRequest,
    task_id: int,
    comment: CommentIn,
) -> Status[CommentOut]:
    """Add a markdown Comment to a Task."""
    added = comments.add_comment(signed_in_user(request), task_id, comment.body)
    return Status(HTTPStatus.CREATED, CommentOut.from_orm(added))


@router.patch(
    "/comments/{int:comment_id}",
    response={
        HTTPStatus.OK: CommentOut,
        HTTPStatus.NOT_FOUND: ErrorOut,
        HTTPStatus.UNPROCESSABLE_ENTITY: ErrorOut,
    },
    summary="Edit a Comment",
)
def edit_comment(
    request: HttpRequest,
    comment_id: int,
    comment: CommentIn,
) -> Status[CommentOut]:
    """Replace a Comment's body."""
    edited = comments.edit_comment(signed_in_user(request), comment_id, comment.body)
    return Status(HTTPStatus.OK, CommentOut.from_orm(edited))


@router.delete(
    "/comments/{int:comment_id}",
    response={
        HTTPStatus.NO_CONTENT: None,
        HTTPStatus.NOT_FOUND: ErrorOut,
        HTTPStatus.UNPROCESSABLE_ENTITY: ErrorOut,
    },
    summary="Delete a Comment",
)
def delete_comment(request: HttpRequest, comment_id: int) -> Status[None]:
    """Delete a Comment for good."""
    comments.delete_comment(signed_in_user(request), comment_id)
    return Status(HTTPStatus.NO_CONTENT, None)
