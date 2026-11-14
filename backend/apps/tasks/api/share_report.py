"""The public report a Share link shows, opened by the key in its address.

Viewers have no account, so it opts out of auth and is found by the key instead. It is
rate-limited per IP so keys can't be guessed, and tells search engines not to index it.
"""

from __future__ import annotations

from functools import wraps
from http import HTTPStatus
from typing import TYPE_CHECKING

from django.conf import settings
from ninja import Router, Status
from ninja.decorators import decorate_view
from ninja.throttling import AnonRateThrottle

from apps.core.schemas import ErrorOut
from apps.tasks import attachments, share_links, share_report
from apps.tasks.api.attachments import file_response
from apps.tasks.schemas.share_report import ShareReportOut

if TYPE_CHECKING:
    from collections.abc import Callable

    from django.http import FileResponse, HttpRequest, HttpResponseBase

router = Router()

NO_LONGER_ACTIVE = "This link is no longer active."


def _noindex[**P](view: Callable[P, HttpResponseBase]) -> Callable[P, HttpResponseBase]:
    """Tell search engines not to index anything the view answers, errors included."""

    @wraps(view)
    def answer(*args: P.args, **kwargs: P.kwargs) -> HttpResponseBase:
        response = view(*args, **kwargs)
        response["X-Robots-Tag"] = "noindex"
        return response

    return answer


class _ReportThrottle(AnonRateThrottle):
    """Counts report opens apart from sign-in attempts, which share the anonymous scope."""

    scope = "share_link"


@router.get(
    "/{key}",
    response={
        HTTPStatus.OK: ShareReportOut,
        HTTPStatus.NOT_FOUND: ErrorOut,
        HTTPStatus.GONE: ErrorOut,
    },
    auth=None,
    throttle=[_ReportThrottle(settings.SHARE_LINK_RATE_LIMIT)],
    summary="Open a Share link's report",
)
@decorate_view(_noindex)
def open_report(request: HttpRequest, key: str) -> Status[ShareReportOut] | Status[ErrorOut]:
    """Return the shared Project's report, or 410 when the link is no longer active.

    An inactive link (stopped, expired, or its Project in Trash) says nothing else about itself
    or its Project. An unknown key is 404, so nobody learns which keys ever existed.
    """
    link = share_report.share_link(key)
    if link is None:
        return Status(HTTPStatus.NOT_FOUND, ErrorOut(detail=share_links.SHARE_LINK_NOT_FOUND))
    if not link.is_active:
        return Status(HTTPStatus.GONE, ErrorOut(detail=NO_LONGER_ACTIVE))
    return Status(HTTPStatus.OK, ShareReportOut.from_orm(share_report.open_report(link)))


@router.get(
    "/{key}/attachments/{int:attachment_id}",
    response={HTTPStatus.NOT_FOUND: ErrorOut},
    auth=None,
    throttle=[_ReportThrottle(settings.SHARE_LINK_RATE_LIMIT)],
    summary="Download an Attachment through a Share link",
    openapi_extra={
        "responses": {
            HTTPStatus.OK: {
                "description": "The file's bytes.",
                "content": {"application/octet-stream": {}},
            },
        },
    },
)
@decorate_view(_noindex)
def download_attachment(
    request: HttpRequest, key: str, attachment_id: int
) -> FileResponse | Status[ErrorOut]:
    """Send an Attachment of a Task in the shared Project, with the same headers as the owner's.

    Any other Attachment, and any Attachment through an inactive link, is 404, so the key can't
    fetch other files and an inactive link says nothing about what it held.
    """
    attachment = share_report.shared_attachment(key, attachment_id)
    if attachment is None:
        return Status(HTTPStatus.NOT_FOUND, ErrorOut(detail=attachments.ATTACHMENT_NOT_FOUND))
    return file_response(attachment)
