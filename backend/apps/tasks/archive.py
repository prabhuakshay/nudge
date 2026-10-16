"""What archiving a Project means for its Tasks: they are read-only and leave cross-Project views.

Archiving and unarchiving themselves live with the other Project rules in `apps.tasks.projects`.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from apps.core.errors import DomainRuleError

if TYPE_CHECKING:
    from django.db.models import QuerySet

    from apps.accounts.models import User
    from apps.tasks.models import Project, Task


class ArchivedProjectError(DomainRuleError):
    """A write to a Task in an archived Project, or a move of a Task into one."""


def ensure_writable(project: Project) -> None:
    """Refuse a change to the Project's Tasks while it is archived.

    Raises:
        ArchivedProjectError: The Project is archived.
    """
    if project.is_archived:
        message = f"“{project.name}” is archived. Unarchive it to change its tasks."
        raise ArchivedProjectError(message)


def active_tasks(user: User) -> QuerySet[Task]:
    """Return the user's Tasks that aren't in Trash or in an archived Project.

    Every view and count that spans Projects starts from this, so archived work stays out of it.
    """
    return user.tasks.filter(
        deleted_at__isnull=True,
        project__deleted_at__isnull=True,
        project__archived_at__isnull=True,
    )
