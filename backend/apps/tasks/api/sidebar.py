"""The sidebar endpoint: everything the sidebar lists, in one request."""

from __future__ import annotations

from typing import TYPE_CHECKING

from ninja import Router

from apps.tasks import services
from apps.tasks.api import signed_in_user
from apps.tasks.schemas import SidebarOut, SidebarProjectOut

if TYPE_CHECKING:
    from django.http import HttpRequest

router = Router()


@router.get("", response=SidebarOut, summary="Get the sidebar")
def sidebar(request: HttpRequest) -> SidebarOut:
    """Return the user's Inbox with its open Task count."""
    inbox = services.inbox(signed_in_user(request))
    return SidebarOut(
        inbox=SidebarProjectOut(
            id=inbox.pk,
            name=inbox.name,
            open_count=services.open_task_count(inbox),
        ),
    )
