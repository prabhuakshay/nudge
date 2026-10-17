"""Attachment endpoints: upload a file to a Task, list a Task's files, download one, delete one.

Files are never served from a public URL. The download checks the owner, and its headers stop a
browser from running an uploaded file as part of Nudge: only images and PDFs open inline, the
type is the one the server chose, sniffing is off and the response is sandboxed.
"""

from __future__ import annotations

from http import HTTPStatus
from typing import TYPE_CHECKING

from django.http import FileResponse
from ninja import File, Router, Status, UploadedFile

from apps.core.auth import signed_in_user
from apps.core.schemas import ErrorOut
from apps.tasks import attachments
from apps.tasks.schemas.attachments import AttachmentOut

if TYPE_CHECKING:
    from django.http import HttpRequest

router = Router()

# Types a browser shows without running anything. SVG and HTML can carry scripts, so they, like
# every other type, download instead.
_INLINE_TYPES = frozenset(
    {"image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf"},
)


@router.post(
    "/tasks/{int:task_id}/attachments",
    response={
        HTTPStatus.CREATED: AttachmentOut,
        HTTPStatus.NOT_FOUND: ErrorOut,
        HTTPStatus.REQUEST_ENTITY_TOO_LARGE: ErrorOut,
        HTTPStatus.UNPROCESSABLE_ENTITY: ErrorOut,
    },
    summary="Attach a file to a Task",
)
def upload_attachment(
    request: HttpRequest,
    task_id: int,
    file: File[UploadedFile],
) -> Status[AttachmentOut] | Status[ErrorOut]:
    """Store one file against a Task, up to the configured size."""
    try:
        attachment = attachments.attach_file(signed_in_user(request), task_id, file)
    except attachments.AttachmentTooLargeError as error:
        return Status(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, ErrorOut(detail=str(error)))
    return Status(HTTPStatus.CREATED, AttachmentOut.from_orm(attachment))


@router.get(
    "/tasks/{int:task_id}/attachments",
    response={HTTPStatus.OK: list[AttachmentOut], HTTPStatus.NOT_FOUND: ErrorOut},
    summary="List a Task's Attachments",
)
def list_attachments(
    request: HttpRequest,
    task_id: int,
) -> Status[list[AttachmentOut]]:
    """Return a Task's Attachments, oldest first."""
    found = attachments.attachments(signed_in_user(request), task_id)
    items = [AttachmentOut.from_orm(attachment) for attachment in found]
    return Status(HTTPStatus.OK, items)


@router.get(
    "/attachments/{int:attachment_id}/download",
    response={HTTPStatus.NOT_FOUND: ErrorOut},
    summary="Download an Attachment",
    openapi_extra={
        "responses": {
            HTTPStatus.OK: {
                "description": "The file's bytes.",
                "content": {"application/octet-stream": {}},
            },
        },
    },
)
def download_attachment(
    request: HttpRequest,
    attachment_id: int,
) -> FileResponse:
    """Send an Attachment's bytes, inline for images and PDFs and as a download otherwise."""
    attachment = attachments.live_attachment(signed_in_user(request), attachment_id)
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
    response={
        HTTPStatus.NO_CONTENT: None,
        HTTPStatus.NOT_FOUND: ErrorOut,
        HTTPStatus.UNPROCESSABLE_ENTITY: ErrorOut,
    },
    summary="Delete an Attachment",
)
def delete_attachment(request: HttpRequest, attachment_id: int) -> Status[None]:
    """Delete an Attachment and its file for good."""
    attachments.delete_attachment(signed_in_user(request), attachment_id)
    return Status(HTTPStatus.NO_CONTENT, None)
