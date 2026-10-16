"""Trash for Projects: deleting one with its Tasks, listing deleted Projects and restoring them.

A deleted Project and its live Tasks share one `trash_unit`, so they list as one Trash row and
come back together. Tasks trashed before their Project stay units of their own. A restored
Project keeps its colour, icon, place and archive state; only a name taken in the meantime or a
Folder deleted in the meantime changes where or what it comes back as.
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from django.db import transaction
from django.db.models import Count, F, Q
from django.utils import timezone

from apps.tasks import reminders
from apps.tasks.models import Project, TaskActivity
from apps.tasks.models.projects import PROJECT_NAME_MAX_LENGTH
from apps.tasks.positions import key_after
from apps.tasks.projects import ProjectRuleError, lock_sidebar, sibling_keys
from apps.tasks.trash import expires_at

if TYPE_CHECKING:
    from django.db.models import QuerySet

    from apps.accounts.models import User

INBOX_CANT_BE_DELETED = "The Inbox can't be deleted."


def trash_project(user: User, project_id: int) -> bool:
    """Send one of the user's live Projects and its live Tasks to Trash; False if it isn't theirs.

    Raises:
        ProjectRuleError: The Project is the Inbox.
    """
    project = user.projects.filter(pk=project_id, deleted_at__isnull=True).first()
    if project is None:
        return False
    if project.is_inbox:
        raise ProjectRuleError(INBOX_CANT_BE_DELETED)
    now = timezone.now()
    with transaction.atomic():
        project.deleted_at, project.trash_unit = now, uuid.uuid4()
        project.save(update_fields=["deleted_at", "trash_unit", "updated_at"])
        ids = list(project.tasks.filter(deleted_at__isnull=True).values_list("pk", flat=True))
        tasks = project.tasks.filter(pk__in=ids)
        reminders.update_tasks(tasks, deleted_at=now, trash_unit=project.trash_unit, updated_at=now)
        TaskActivity.objects.bulk_create(
            TaskActivity(task_id=pk, kind=TaskActivity.Kind.TRASHED, at=now) for pk in ids
        )
    return True


def trashed_projects(user: User) -> QuerySet[Project]:
    """Return the user's Projects in Trash, most recently deleted first.

    Each comes with `task_count` (how many Tasks went to Trash with it) and `expires_at` (when it
    will be deleted for good).
    """
    return (
        user.projects.filter(trash_unit__isnull=False)
        .annotate(
            task_count=Count("tasks", filter=Q(tasks__trash_unit=F("trash_unit"))),
            expires_at=expires_at(),
        )
        .order_by("-deleted_at", "-id")
    )


def restore_project(user: User, project_id: int) -> Project | None:
    """Bring back one of the user's Projects in Trash with its Tasks; None if there's none.

    A name a live Project took in the meantime gets a " (2)" suffix, or the next free number.
    """
    project = user.projects.filter(pk=project_id, trash_unit__isnull=False).first()
    if project is None:
        return None
    now = timezone.now()
    with transaction.atomic():
        lock_sidebar(user)
        ids = list(user.tasks.filter(trash_unit=project.trash_unit).values_list("pk", flat=True))
        project.name = _free_name(user, project.name)
        project.position = _free_position(user, project)
        project.deleted_at = project.trash_unit = None
        project.save(update_fields=["name", "position", "deleted_at", "trash_unit", "updated_at"])
        tasks = project.tasks.filter(pk__in=ids)
        reminders.update_tasks(tasks, deleted_at=None, trash_unit=None, updated_at=now)
        TaskActivity.objects.bulk_create(
            TaskActivity(task_id=pk, kind=TaskActivity.Kind.RESTORED, at=now) for pk in ids
        )
    return project


def _free_name(user: User, name: str) -> str:
    """Return the name, or the first "<name> (n)" no live Project of the user has."""
    taken = {
        taken.lower()
        for taken in user.projects.filter(deleted_at__isnull=True, is_inbox=False).values_list(
            "name", flat=True
        )
    }
    candidate, number = name, 1
    while candidate.lower() in taken:
        number += 1
        suffix = f" ({number})"
        candidate = name[: PROJECT_NAME_MAX_LENGTH - len(suffix)] + suffix
    return candidate


def _free_position(user: User, project: Project) -> str:
    """Return the Project's old key, or one right after the sibling that has since taken it.

    Two siblings can't share a key, or nothing could ever be placed between them.
    """
    siblings = sibling_keys(user, project.folder)
    clash = next((ref for ref, key in siblings if key == project.position), None)
    if clash is None:
        return project.position
    return key_after(siblings, clash)
