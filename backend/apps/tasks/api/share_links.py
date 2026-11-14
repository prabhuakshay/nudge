"""Share link endpoints for their owner: list a Project's Share links, create one, stop one.

Mounted at the API root because a Project's Share links live under `/projects/{id}/share-links`
while a single Share link lives under `/share-links/{id}`.
"""

from __future__ import annotations

from http import HTTPStatus
from typing import TYPE_CHECKING

from ninja import Router, Status

from apps.core.auth import signed_in_user
from apps.core.schemas import ErrorOut
from apps.tasks import share_links
from apps.tasks.schemas.share_links import ShareLinkOut

if TYPE_CHECKING:
    from django.http import HttpRequest

router = Router()


@router.get(
    "/projects/{int:project_id}/share-links",
    response={HTTPStatus.OK: list[ShareLinkOut], HTTPStatus.NOT_FOUND: ErrorOut},
    summary="List a Project's Share links",
)
def list_share_links(request: HttpRequest, project_id: int) -> Status[list[ShareLinkOut]]:
    """List the Project's Share links that haven't been stopped, oldest first."""
    found = share_links.project_share_links(signed_in_user(request), project_id)
    return Status(HTTPStatus.OK, [ShareLinkOut.from_orm(link) for link in found])


@router.post(
    "/projects/{int:project_id}/share-links",
    response={
        HTTPStatus.CREATED: ShareLinkOut,
        HTTPStatus.NOT_FOUND: ErrorOut,
        HTTPStatus.UNPROCESSABLE_ENTITY: ErrorOut,
    },
    summary="Share a Project",
)
def create_share_link(request: HttpRequest, project_id: int) -> Status[ShareLinkOut]:
    """Create a Share link that expires in 7 days and shows 14 days of history.

    The Inbox and Projects in Trash can't be shared.
    """
    created = share_links.create_share_link(signed_in_user(request), project_id)
    return Status(HTTPStatus.CREATED, ShareLinkOut.from_orm(created))


@router.post(
    "/share-links/{int:link_id}/stop",
    response={HTTPStatus.NO_CONTENT: None, HTTPStatus.NOT_FOUND: ErrorOut},
    summary="Stop sharing",
)
def stop_share_link(request: HttpRequest, link_id: int) -> Status[None]:
    """Stop a Share link: its address shows "no longer active" from now on."""
    share_links.stop_share_link(signed_in_user(request), link_id)
    return Status(HTTPStatus.NO_CONTENT, None)
