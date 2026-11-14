"""The report a Share link shows: its Project's Tasks as they are now, for a viewer with no account.

The key in the address is the only protection, so an unknown key is not found, while a key whose
link is stopped, expired or whose Project is in Trash only says the link is no longer active.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from django.utils import timezone

from apps.accounts.services import local_zone
from apps.tasks.models import OPEN_STATUSES, ShareLink

if TYPE_CHECKING:
    from datetime import datetime

    from apps.tasks.models import Project, Task


@dataclass(frozen=True)
class ReportSection:
    """A group of the report's Tasks. A null name holds the Tasks outside any Section."""

    name: str | None
    tasks: list[Task]


@dataclass(frozen=True)
class Report:
    """What a Share link shows: its Project, when the report was made, and its Tasks."""

    project: Project
    as_of: datetime
    sections: list[ReportSection]


def share_link(key: str) -> ShareLink | None:
    """Return the Share link whose address carries this key, active or not, if any."""
    return ShareLink.objects.select_related("project", "owner").filter(key=key).first()


def open_report(link: ShareLink) -> Report:
    """Record that the active link was opened, and return its Project's report as of now.

    Times are in the owner's time zone, so the viewer reads the same days the owner does.
    """
    now = timezone.now()
    link.last_opened_at = now
    link.save(update_fields=["last_opened_at"])
    project = link.project
    open_tasks = list(
        project.tasks.filter(deleted_at__isnull=True, status__in=OPEN_STATUSES).order_by(
            "position", "id"
        )
    )
    return Report(
        project=project,
        as_of=timezone.localtime(now, local_zone(link.owner)),
        sections=[ReportSection(name=None, tasks=open_tasks)] if open_tasks else [],
    )
