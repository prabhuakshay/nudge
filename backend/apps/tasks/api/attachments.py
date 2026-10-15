"""Attachment endpoints: upload a file to a Task, list a Task's files, download one, delete one.

Files are never served from a public URL. The download checks the owner, and its headers stop a
browser from running an uploaded file as part of Nudge: only images and PDFs open inline, the
type is the one the server chose, sniffing is off and the response is sandboxed.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from django.http import FileResponse
from ninja import File, Router, Status, UploadedFile

from apps.accounts.schemas import ErrorOut
from apps.tasks import services
from apps.tasks.api import signed_in_user
from apps.tasks.schemas import AttachmentOut

if TYPE_CHECKING:
    from django.http import HttpRequest

router = Router()

_HTTP_OK = 200
_HTTP_CREATED = 201
_HTTP_NO_CONTENT = 204
_HTTP_NOT_FOUND = 404
_HTTP_CONTENT_TOO_LARGE = 413
_TASK_NOT_FOUND = ErrorOut(detail="Task not found.")
_ATTACHMENT_NOT_FOUND = ErrorOut(detail="Attachment not found.")

# Types a browser shows without running anything. SVG and HTML can carry scripts, so they, like
# every other type, download instead.
_INLINE_TYPES = frozenset(
    {"image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf"},
)


@router.post(
    "/tasks/{int:task_id}/attachments",
    response={
        _HTTP_CREATED: AttachmentOut,
        _HTTP_NOT_FOUND: ErrorOut,
        _HTTP_CONTENT_TOO_LARGE: ErrorOut,
    },
    summary="Attach a file to a Task",
)
def upload_attachment(
    request: HttpRequest,
    task_id: int,
    file: File[UploadedFile],
) -> Status[AttachmentOut] | Status[ErrorOut]:
    """Store one file against a Task, up to the configured size."""
    task = services.live_task(signed_in_user(request), task_id)
    if task is None:
        return Status(_HTTP_NOT_FOUND, _TASK_NOT_FOUND)
    try:
        attachment = services.attach_file(task, file)
    except services.AttachmentTooLargeError as error:
        return Status(_HTTP_CONTENT_TOO_LARGE, ErrorOut(detail=str(error)))
    return Status(_HTTP_CREATED, AttachmentOut.from_orm(attachment))


@router.get(
    "/tasks/{int:task_id}/attachments",
    response={_HTTP_OK: list[AttachmentOut], _HTTP_NOT_FOUND: ErrorOut},
    summary="List a Task's Attachments",
)
def list_attachments(
    request: HttpRequest,
    task_id: int,
) -> Status[list[AttachmentOut]] | Status[ErrorOut]:
    """Return a Task's Attachments, oldest first."""
    task = services.live_task(signed_in_user(request), task_id)
    if task is None:
        return Status(_HTTP_NOT_FOUND, _TASK_NOT_FOUND)
    items = [AttachmentOut.from_orm(attachment) for attachment in services.attachments(task)]
    return Status(_HTTP_OK, items)


@router.get(
    "/attachments/{int:attachment_id}/download",
    response={_HTTP_NOT_FOUND: ErrorOut},
    summary="Download an Attachment",
    openapi_extra={
        "responses": {
            _HTTP_OK: {
                "description": "The file's bytes.",
                "content": {"application/octet-stream": {}},
            },
        },
    },
)
def download_attachment(
    request: HttpRequest,
    attachment_id: int,
) -> FileResponse | Status[ErrorOut]:
    """Send an Attachment's bytes, inline for images and PDFs and as a download otherwise."""
    attachment = services.live_attachment(signed_in_user(request), attachment_id)
    if attachment is None:
        return Status(_HTTP_NOT_FOUND, _ATTACHMENT_NOT_FOUND)
    response = FileResponse(
        attachment.file.open("rb"),
        as_attachment=attachment.content_type not in _INLINE_TYPES,
        filename=attachment.name,
        content_type=attachment.content_type,
    )
    response["X-Content-Type-Options"] = "nosniff"
    response["Content-Security-Policy"] = "sandbox"
    return response


@router.delete(
    "/attachments/{int:attachment_id}",
    response={_HTTP_NO_CONTENT: None, _HTTP_NOT_FOUND: ErrorOut},
    summary="Delete an Attachment",
)
def delete_attachment(request: HttpRequest, attachment_id: int) -> Status[None] | Status[ErrorOut]:
    """Delete an Attachment and its file for good."""
    if not services.delete_attachment(signed_in_user(request), attachment_id):
        return Status(_HTTP_NOT_FOUND, _ATTACHMENT_NOT_FOUND)
    return Status(_HTTP_NO_CONTENT, None)
