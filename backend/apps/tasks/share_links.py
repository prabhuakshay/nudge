"""Business rules for Share links: sharing a Project, listing its links and stopping one.

A Share link's address carries a random key instead of a session, so whoever has it can open the
Project's report without an account. The Inbox and Projects in Trash can't be shared.
"""

from __future__ import annotations

from datetime import timedelta
from typing import TYPE_CHECKING

from django.utils import timezone

from apps.core.address_secrets import new_address_secret
from apps.core.errors import DomainRuleError, NotFoundError
from apps.tasks import live
from apps.tasks.models import ShareLink

if TYPE_CHECKING:
    from django.db.models import QuerySet

    from apps.accounts.models import User

DEFAULT_EXPIRY_DAYS = 7
DEFAULT_RANGE_DAYS = 14

INBOX_CANT_BE_SHARED = "The Inbox can't be shared."
TRASHED_PROJECT_CANT_BE_SHARED = "A Project in Trash can't be shared. Restore it first."
SHARE_LINK_NOT_FOUND = "Share link not found."


class ShareLinkRuleError(DomainRuleError):
    """A Share link the rules refuse, such as one to the Inbox."""


def project_share_links(user: User, project_id: int) -> QuerySet[ShareLink]:
    """Return the user's live Project's Share links that haven't been stopped, oldest first.

    Raises:
        NotFoundError: The user has no such live Project.
    """
    project = live.project(user, project_id)
    return project.share_links.filter(stopped_at__isnull=True)


def create_share_link(user: User, project_id: int) -> ShareLink:
    """Share the user's Project with a new link that expires in 7 days and shows 14 days back.

    Raises:
        NotFoundError: The user has no such Project.
        ShareLinkRuleError: The Project is the Inbox or in Trash.
    """
    project = user.projects.filter(pk=project_id).first()
    if project is None:
        raise NotFoundError(live.PROJECT_NOT_FOUND)
    if project.is_inbox:
        raise ShareLinkRuleError(INBOX_CANT_BE_SHARED)
    if project.deleted_at is not None:
        raise ShareLinkRuleError(TRASHED_PROJECT_CANT_BE_SHARED)
    now = timezone.now()
    return ShareLink.objects.create(
        owner=user,
        project=project,
        key=new_address_secret(),
        created_at=now,
        expires_at=now + timedelta(days=DEFAULT_EXPIRY_DAYS),
        range_days=DEFAULT_RANGE_DAYS,
    )


def stop_share_link(user: User, link_id: int) -> None:
    """Stop sharing: the link's address answers "no longer active" from now on.

    Raises:
        NotFoundError: The user has no such Share link.
    """
    link = user.share_links.filter(pk=link_id).first()
    if link is None:
        raise NotFoundError(SHARE_LINK_NOT_FOUND)
    if link.stopped_at is None:
        link.stopped_at = timezone.now()
        link.save(update_fields=["stopped_at"])
