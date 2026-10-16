"""Comment endpoints: list and add a Task's Comments, edit or delete one."""

from __future__ import annotations

from http import HTTPStatus
from typing import TYPE_CHECKING

from ninja import Router, Status

from apps.core.auth import signed_in_user
from apps.core.schemas import ErrorOut
from apps.tasks import comments, services
from apps.tasks.api.errors import TASK_NOT_FOUND
from apps.tasks.schemas.comments import CommentIn, CommentOut

if TYPE_CHECKING:
    from django.http import HttpRequest

router = Router()

_COMMENT_NOT_FOUND = ErrorOut(detail="Comment not found.")


@router.get(
    "/tasks/{int:task_id}/comments",
    response={HTTPStatus.OK: list[CommentOut], HTTPStatus.NOT_FOUND: ErrorOut},
    summary="List a Task's Comments",
)
def list_comments(
    request: HttpRequest,
    task_id: int,
) -> Status[list[CommentOut]] | Status[ErrorOut]:
    """Return all of a Task's Comments, oldest first."""
    task = services.live_task(signed_in_user(request), task_id)
    if task is None:
        return Status(HTTPStatus.NOT_FOUND, TASK_NOT_FOUND)
    return Status(
        HTTPStatus.OK, [CommentOut.from_orm(comment) for comment in comments.comments(task)]
    )


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
) -> Status[CommentOut] | Status[ErrorOut]:
    """Add a markdown Comment to a Task."""
    task = services.live_task(signed_in_user(request), task_id)
    if task is None:
        return Status(HTTPStatus.NOT_FOUND, TASK_NOT_FOUND)
    added = comments.add_comment(task, comment.body)
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
) -> Status[CommentOut] | Status[ErrorOut]:
    """Replace a Comment's body."""
    edited = comments.edit_comment(signed_in_user(request), comment_id, comment.body)
    if edited is None:
        return Status(HTTPStatus.NOT_FOUND, _COMMENT_NOT_FOUND)
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
def delete_comment(request: HttpRequest, comment_id: int) -> Status[None] | Status[ErrorOut]:
    """Delete a Comment for good."""
    deleted = comments.delete_comment(signed_in_user(request), comment_id)
    if not deleted:
        return Status(HTTPStatus.NOT_FOUND, _COMMENT_NOT_FOUND)
    return Status(HTTPStatus.NO_CONTENT, None)
