"""Business rules for Projects and Tasks: the Inbox, ordering, listing, Status, pins and Activity.

Every function takes the user first and reaches Projects and Tasks through that user's related
managers, so another user's ids behave as if they don't exist. A change and the Activity event
that records it are saved in one transaction, so a Task's history never misses or invents a change.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from django.db import transaction
from django.db.models import F
from django.utils import timezone
from fractional_indexing import generate_key_between

from apps.tasks.models import (
    CLOSED_STATUSES,
    INBOX_NAME,
    OPEN_STATUSES,
    Project,
    Task,
    TaskActivity,
)
from apps.tasks.pagination import Page, newest_first

if TYPE_CHECKING:
    from django.db.models import QuerySet

    from apps.accounts.models import User


class TaskRuleError(Exception):
    """A change that would break a Task rule. The message says which, in the user's words."""


@dataclass(frozen=True)
class TaskEdit:
    """The fields of a Task to change; a field left as None stays as it is."""

    title: str | None = None
    description: str | None = None
    status: Task.Status | None = None
    blocked_reason: str | None = None
    priority: Task.Priority | None = None
    pinned: bool | None = None


@dataclass(frozen=True)
class AffectedTask:
    """A Task whose Status a change touched, with what it had before, so Undo can restore it."""

    id: int
    prior_status: Task.Status
    prior_blocked_reason: str


@dataclass(frozen=True)
class TaskChange:
    """A Task after a change, and the Tasks whose Status it changed."""

    task: Task
    affected: list[AffectedTask]


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
    """Return the Project's open and Blocked Tasks: pinned ones first, then in manual order."""
    return (
        _live_tasks(project)
        .filter(status__in=OPEN_STATUSES)
        .order_by(F("pinned_at").asc(nulls_last=True), "position", "id")
    )


def open_task_count(project: Project) -> int:
    """Return how many open and Blocked Tasks the Project holds."""
    return open_tasks(project).count()


def closed_tasks(project: Project, cursor: str | None = None) -> Page[Task]:
    """Return a page of the Project's Closed Tasks, most recently completed first.

    Raises:
        InvalidCursorError: The cursor wasn't one this function returned.
    """
    closed = _live_tasks(project).filter(status__in=CLOSED_STATUSES)
    return newest_first(closed, "completed_at", cursor)


def create_task(project: Project, title: str) -> Task:
    """Create a Task in the Project, first among its Tasks, owned by the Project's owner."""
    with transaction.atomic():
        # Locking the Project serialises inserts into it, so two Tasks never get the same key.
        Project.objects.select_for_update().get(pk=project.pk)
        first = project.tasks.order_by("position", "id").values_list("position", flat=True).first()
        position = str(generate_key_between(None, first))
        task = Task.objects.create(
            owner_id=project.owner_id,
            project=project,
            title=title,
            position=position,
        )
        TaskActivity.objects.create(task=task, kind=TaskActivity.Kind.CREATED, at=task.created_at)
        return task


def duplicate_task(user: User, task_id: int) -> Task | None:
    """Copy one of the user's Tasks to right after it; return None if it isn't theirs.

    The copy is a fresh open Task with the original's title, Description and Priority.
    """
    original = live_task(user, task_id)
    if original is None:
        return None
    with transaction.atomic():
        # Locking the Project serialises inserts into it, so two Tasks never get the same key.
        Project.objects.select_for_update().get(pk=original.project_id)
        following = (
            original.project.tasks.filter(position__gt=original.position)
            .order_by("position")
            .values_list("position", flat=True)
            .first()
        )
        task = Task.objects.create(
            owner=user,
            project_id=original.project_id,
            title=original.title,
            description=original.description,
            priority=original.priority,
            position=str(generate_key_between(original.position, following)),
        )
        TaskActivity.objects.create(task=task, kind=TaskActivity.Kind.CREATED, at=task.created_at)
        return task


def live_task(user: User, task_id: int) -> Task | None:
    """Return one of the user's Tasks that isn't in Trash, or None."""
    return user.tasks.filter(pk=task_id, deleted_at__isnull=True).first()


_EDITABLE_FIELDS = (
    "title",
    "description",
    "status",
    "blocked_reason",
    "priority",
    "completed_at",
    "pinned_at",
)


def update_task(user: User, task_id: int, edit: TaskEdit) -> TaskChange | None:
    """Change the given fields of one of the user's Tasks; return None if it isn't theirs.

    Raises:
        TaskRuleError: The edit gives a Blocked reason to a Task that isn't Blocked.
    """
    task = live_task(user, task_id)
    if task is None:
        return None
    before = {name: getattr(task, name) for name in _EDITABLE_FIELDS}
    _apply(task, edit)
    changed = [name for name in _EDITABLE_FIELDS if getattr(task, name) != before[name]]
    affected = []
    if "status" in changed:
        affected.append(
            AffectedTask(task.pk, Task.Status(before["status"]), before["blocked_reason"]),
        )
    with transaction.atomic():
        if changed:
            task.save(update_fields=[*changed, "updated_at"])
        TaskActivity.objects.bulk_create(_activity(task, before))
    return TaskChange(task=task, affected=affected)


def _apply(task: Task, edit: TaskEdit) -> None:
    if edit.title is not None:
        task.title = edit.title
    if edit.description is not None:
        task.description = edit.description
    if edit.priority is not None:
        task.priority = edit.priority
    if edit.status is not None and edit.status != task.status:
        task.status = edit.status
        task.completed_at = timezone.now() if edit.status in CLOSED_STATUSES else None
        # A reason belongs to one spell of being Blocked, so any Status change drops it.
        task.blocked_reason = ""
    if edit.blocked_reason is not None:
        if edit.blocked_reason and task.status != Task.Status.BLOCKED:
            message = "Only a Blocked task can have a Blocked reason."
            raise TaskRuleError(message)
        task.blocked_reason = edit.blocked_reason
    if edit.pinned is not None and edit.pinned != (task.pinned_at is not None):
        task.pinned_at = timezone.now() if edit.pinned else None


def _activity(task: Task, before: dict[str, object]) -> list[TaskActivity]:
    """Return the history events for the difference between `before` and the Task as it is now."""
    events = []
    if task.title != before["title"]:
        data = {"old": before["title"], "new": task.title}
        events.append(TaskActivity(task=task, kind=TaskActivity.Kind.TITLE_CHANGED, data=data))
    if task.description != before["description"]:
        events.append(TaskActivity(task=task, kind=TaskActivity.Kind.DESCRIPTION_EDITED))
    if task.status != before["status"]:
        data = {"old": before["status"], "new": task.status, "blocked_reason": task.blocked_reason}
        events.append(TaskActivity(task=task, kind=TaskActivity.Kind.STATUS_CHANGED, data=data))
    if task.priority != before["priority"]:
        data = {"old": before["priority"], "new": task.priority}
        events.append(TaskActivity(task=task, kind=TaskActivity.Kind.PRIORITY_CHANGED, data=data))
    if (task.pinned_at is None) != (before["pinned_at"] is None):
        kind = TaskActivity.Kind.UNPINNED if task.pinned_at is None else TaskActivity.Kind.PINNED
        events.append(TaskActivity(task=task, kind=kind))
    return events


def task_activity(task: Task, cursor: str | None = None) -> Page[TaskActivity]:
    """Return a page of the Task's history, newest first.

    Raises:
        InvalidCursorError: The cursor wasn't one this function returned.
    """
    return newest_first(task.activity.all(), "at", cursor)


def activity_count(task: Task) -> int:
    """Return how many events the Task's history holds."""
    return task.activity.count()
