"""Comment endpoints: list and add a Task's Comments, edit or delete one."""

from __future__ import annotations

from typing import TYPE_CHECKING

from ninja import Router, Status

from apps.accounts.schemas import ErrorOut
from apps.tasks import comments, services
from apps.tasks.api import signed_in_user
from apps.tasks.archive import ArchivedProjectError
from apps.tasks.mentions import MentionError
from apps.tasks.schemas import CommentIn, CommentOut

if TYPE_CHECKING:
    from django.http import HttpRequest

router = Router()

_HTTP_OK = 200
_HTTP_CREATED = 201
_HTTP_NO_CONTENT = 204
_HTTP_NOT_FOUND = 404
_HTTP_UNPROCESSABLE = 422
_TASK_NOT_FOUND = ErrorOut(detail="Task not found.")
_COMMENT_NOT_FOUND = ErrorOut(detail="Comment not found.")


@router.get(
    "/tasks/{int:task_id}/comments",
    response={_HTTP_OK: list[CommentOut], _HTTP_NOT_FOUND: ErrorOut},
    summary="List a Task's Comments",
)
def list_comments(
    request: HttpRequest,
    task_id: int,
) -> Status[list[CommentOut]] | Status[ErrorOut]:
    """Return all of a Task's Comments, oldest first."""
    task = services.live_task(signed_in_user(request), task_id)
    if task is None:
        return Status(_HTTP_NOT_FOUND, _TASK_NOT_FOUND)
    return Status(_HTTP_OK, [CommentOut.from_orm(comment) for comment in comments.comments(task)])


@router.post(
    "/tasks/{int:task_id}/comments",
    response={_HTTP_CREATED: CommentOut, _HTTP_NOT_FOUND: ErrorOut, _HTTP_UNPROCESSABLE: ErrorOut},
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
        return Status(_HTTP_NOT_FOUND, _TASK_NOT_FOUND)
    try:
        added = comments.add_comment(task, comment.body)
    except (MentionError, ArchivedProjectError) as error:
        return Status(_HTTP_UNPROCESSABLE, ErrorOut(detail=str(error)))
    return Status(_HTTP_CREATED, CommentOut.from_orm(added))


@router.patch(
    "/comments/{int:comment_id}",
    response={_HTTP_OK: CommentOut, _HTTP_NOT_FOUND: ErrorOut, _HTTP_UNPROCESSABLE: ErrorOut},
    summary="Edit a Comment",
)
def edit_comment(
    request: HttpRequest,
    comment_id: int,
    comment: CommentIn,
) -> Status[CommentOut] | Status[ErrorOut]:
    """Replace a Comment's body."""
    try:
        edited = comments.edit_comment(signed_in_user(request), comment_id, comment.body)
    except (MentionError, ArchivedProjectError) as error:
        return Status(_HTTP_UNPROCESSABLE, ErrorOut(detail=str(error)))
    if edited is None:
        return Status(_HTTP_NOT_FOUND, _COMMENT_NOT_FOUND)
    return Status(_HTTP_OK, CommentOut.from_orm(edited))


@router.delete(
    "/comments/{int:comment_id}",
    response={_HTTP_NO_CONTENT: None, _HTTP_NOT_FOUND: ErrorOut, _HTTP_UNPROCESSABLE: ErrorOut},
    summary="Delete a Comment",
)
def delete_comment(request: HttpRequest, comment_id: int) -> Status[None] | Status[ErrorOut]:
    """Delete a Comment for good."""
    try:
        deleted = comments.delete_comment(signed_in_user(request), comment_id)
    except ArchivedProjectError as error:
        return Status(_HTTP_UNPROCESSABLE, ErrorOut(detail=str(error)))
    if not deleted:
        return Status(_HTTP_NOT_FOUND, _COMMENT_NOT_FOUND)
    return Status(_HTTP_NO_CONTENT, None)
