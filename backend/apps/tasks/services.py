"""Business rules for Projects and Tasks: the Inbox, ordering, listing and completing.

Every function takes the user first and reaches Projects and Tasks through that user's related
managers, so another user's ids behave as if they don't exist.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from django.db import transaction
from django.utils import timezone
from fractional_indexing import generate_key_between

from apps.tasks.models import INBOX_NAME, Project, Task
from apps.tasks.pagination import Page, newest_first

if TYPE_CHECKING:
    from django.db.models import QuerySet

    from apps.accounts.models import User


@dataclass(frozen=True)
class TaskChange:
    """A Task after a change, and the Tasks whose Status it changed, with their prior Status."""

    task: Task
    affected: list[tuple[int, Task.Status]]


def create_inbox(user: User) -> Project:
    """Create the user's Inbox."""
    return Project.objects.create(owner=user, name=INBOX_NAME, is_inbox=True)


def inbox(user: User) -> Project:
    """Return the user's Inbox."""
    return user.projects.get(is_inbox=True)


def live_project(user: User, project_id: int) -> Project | None:
    """Return one of the user's Projects that isn't in Trash, or None."""
    return user.projects.filter(pk=project_id, deleted_at__isnull=True).first()


def _live_tasks(project: Project) -> QuerySet[Task]:
    return project.tasks.filter(deleted_at__isnull=True)


def open_tasks(project: Project) -> QuerySet[Task]:
    """Return the Project's open Tasks in the user's manual order."""
    return _live_tasks(project).filter(status=Task.Status.OPEN)


def open_task_count(project: Project) -> int:
    """Return how many open Tasks the Project holds."""
    return open_tasks(project).count()


def closed_tasks(project: Project, cursor: str | None = None) -> Page[Task]:
    """Return a page of the Project's Closed Tasks, most recently completed first.

    Raises:
        InvalidCursorError: The cursor wasn't one this function returned.
    """
    closed = _live_tasks(project).exclude(status=Task.Status.OPEN)
    return newest_first(closed, "completed_at", cursor)


def create_task(project: Project, title: str) -> Task:
    """Create a Task in the Project, first among its Tasks, owned by the Project's owner."""
    with transaction.atomic():
        # Locking the Project serialises inserts into it, so two Tasks never get the same key.
        Project.objects.select_for_update().get(pk=project.pk)
        first = project.tasks.order_by("position", "id").values_list("position", flat=True).first()
        position = str(generate_key_between(None, first))
        return Task.objects.create(
            owner_id=project.owner_id,
            project=project,
            title=title,
            position=position,
        )


def live_task(user: User, task_id: int) -> Task | None:
    """Return one of the user's Tasks that isn't in Trash, or None."""
    return user.tasks.filter(pk=task_id, deleted_at__isnull=True).first()


def update_task(
    user: User,
    task_id: int,
    *,
    title: str | None = None,
    description: str | None = None,
    status: Task.Status | None = None,
) -> TaskChange | None:
    """Change the given fields of one of the user's Tasks; return None if it isn't theirs.

    Completing a Task records when; reopening it clears that.
    """
    task = live_task(user, task_id)
    if task is None:
        return None
    changed: list[str] = []
    if title is not None and title != task.title:
        task.title = title
        changed.append("title")
    if description is not None and description != task.description:
        task.description = description
        changed.append("description")
    affected: list[tuple[int, Task.Status]] = []
    if status is not None and status != task.status:
        affected.append((task.pk, Task.Status(task.status)))
        task.status = status
        task.completed_at = timezone.now() if status == Task.Status.COMPLETED else None
        changed += ["status", "completed_at"]
    if changed:
        task.save(update_fields=[*changed, "updated_at"])
    return TaskChange(task=task, affected=affected)
