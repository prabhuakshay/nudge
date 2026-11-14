"""Business rules for Share links: sharing a Project, listing, changing and stopping its links.

A Share link's address carries a random key instead of a session, so whoever has it can open the
Project's report without an account. The Inbox and Projects in Trash can't be shared.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import TYPE_CHECKING, TypedDict

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
MAX_EXPIRY_DAYS = 3650
RANGE_CHOICES = (7, 14, 30)

INBOX_CANT_BE_SHARED = "The Inbox can't be shared."
TRASHED_PROJECT_CANT_BE_SHARED = "A Project in Trash can't be shared. Restore it first."
SHARE_LINK_NOT_FOUND = "Share link not found."
BAD_EXPIRY = f"A Share link expires after 1 to {MAX_EXPIRY_DAYS} days, or never."
BAD_RANGE = "A Share link's range is 7, 14 or 30 days, or all."


class ShareLinkRuleError(DomainRuleError):
    """A Share link the rules refuse, such as one to the Inbox."""


def project_share_links(user: User, project_id: int) -> QuerySet[ShareLink]:
    """Return the user's live Project's Share links that haven't been stopped, oldest first.

    Raises:
        NotFoundError: The user has no such live Project.
    """
    project = live.project(user, project_id)
    return project.share_links.filter(stopped_at__isnull=True)


def create_share_link(
    user: User,
    project_id: int,
    *,
    expires_in_days: int | None = DEFAULT_EXPIRY_DAYS,
    range_days: int | None = DEFAULT_RANGE_DAYS,
) -> ShareLink:
    """Share the user's Project with a new link; None means it never expires or shows all.

    Raises:
        NotFoundError: The user has no such Project.
        ShareLinkRuleError: The Project is the Inbox or in Trash, or a setting isn't allowed.
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
        expires_at=_expiry(now, expires_in_days),
        range_days=_checked_range(range_days),
    )


class ShareLinkChanges(TypedDict, total=False):
    """The settings of a Share link to change; None means never expires or shows all."""

    expires_in_days: int | None
    range_days: int | None


def update_share_link(user: User, link_id: int, changes: ShareLinkChanges) -> ShareLink:
    """Change a Share link's expiry, counted from now, or its range; its key stays the same.

    Raises:
        NotFoundError: The user has no such Share link.
        ShareLinkRuleError: A setting isn't allowed.
    """
    link = _share_link(user, link_id)
    if "expires_in_days" in changes:
        link.expires_at = _expiry(timezone.now(), changes["expires_in_days"])
    if "range_days" in changes:
        link.range_days = _checked_range(changes["range_days"])
    link.save(update_fields=["expires_at", "range_days"])
    return link


def stop_share_link(user: User, link_id: int) -> None:
    """Stop sharing: the link's address answers "no longer active" from now on.

    Raises:
        NotFoundError: The user has no such Share link.
    """
    link = _share_link(user, link_id)
    if link.stopped_at is None:
        link.stopped_at = timezone.now()
        link.save(update_fields=["stopped_at"])


def _share_link(user: User, link_id: int) -> ShareLink:
    """Return one of the user's Share links.

    Raises:
        NotFoundError: The user has no such Share link.
    """
    link = user.share_links.filter(pk=link_id).first()
    if link is None:
        raise NotFoundError(SHARE_LINK_NOT_FOUND)
    return link


def _expiry(now: datetime, expires_in_days: int | None) -> datetime | None:
    """Return when a link that lasts `expires_in_days` from now stops working; None for never.

    Raises:
        ShareLinkRuleError: The number of days is out of bounds.
    """
    if expires_in_days is None:
        return None
    # The cap keeps the date within what the database and Python can store.
    if not 1 <= expires_in_days <= MAX_EXPIRY_DAYS:
        raise ShareLinkRuleError(BAD_EXPIRY)
    return now + timedelta(days=expires_in_days)


def _checked_range(range_days: int | None) -> int | None:
    """Return the range if it is one of the choices or None for all.

    Raises:
        ShareLinkRuleError: The range isn't one of the choices.
    """
    if range_days is not None and range_days not in RANGE_CHOICES:
        raise ShareLinkRuleError(BAD_RANGE)
    return range_days
