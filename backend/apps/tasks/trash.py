"""Trash: deleting Tasks, listing what was deleted and restoring it.

A delete sends a Task and its live Subtasks to Trash as one unit (a deleted Project is a unit of
its own, see `apps.tasks.project_trash`): every row it touched gets the
same `trash_unit`, so the unit lists as one row and comes back whole. Trashed rows are inert:
they leave every list and count, and their Reminders stop. Restoring puts the unit back where it
was if it still can, else at the bottom of its Project, or of the Inbox if the Project is gone.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import timedelta
from typing import TYPE_CHECKING

from django.conf import settings
from django.db import transaction
from django.db.models import (
    Count,
    DateTimeField,
    ExpressionWrapper,
    F,
    OuterRef,
    Subquery,
    Value,
)
from django.utils import timezone

from apps.tasks import reminders, services
from apps.tasks.archive import ensure_writable
from apps.tasks.models import MAX_DEPTH, Project, Task, TaskActivity
from apps.tasks.rows import as_rows
from apps.tasks.siblings import task_siblings
from apps.tasks.tree import below, reopen_ancestors

if TYPE_CHECKING:
    from django.db.models import QuerySet
    from django.db.models.expressions import CombinedExpression

    from apps.accounts.models import User


@dataclass(frozen=True)
class Restored:
    """A Task back from Trash, as a list row, and the Project it went back to."""

    task: Task
    project: Project


def trash_task(user: User, task_id: int) -> bool:
    """Send one of the user's live Tasks and its live Subtasks to Trash; False if it isn't theirs.

    Subtasks trashed earlier on their own stay units of their own.

    Raises:
        ArchivedProjectError: The Task is in an archived Project.
    """
    task = user.tasks.filter(pk=task_id, deleted_at__isnull=True).select_related("project").first()
    if task is None:
        return False
    ensure_writable(task.project)
    now = timezone.now()
    with transaction.atomic():
        ids = [task.pk, *below([task]).values_list("pk", flat=True)]
        unit = user.tasks.filter(pk__in=ids)
        reminders.update_tasks(unit, deleted_at=now, trash_unit=uuid.uuid4(), updated_at=now)
        TaskActivity.objects.bulk_create(
            TaskActivity(task_id=pk, kind=TaskActivity.Kind.TRASHED, at=now) for pk in ids
        )
    return True


def trashed_tasks(user: User) -> QuerySet[Task]:
    """Return the head of each of the user's Trash units, most recently deleted first.

    Each comes with `project_name`, `subtask_count` (how many Subtasks went to Trash with it) and
    `expires_at` (when it will be deleted for good).
    """
    members = (
        Task.objects.filter(trash_unit=OuterRef("trash_unit"))
        .order_by()
        .values("trash_unit")
        .annotate(count=Count("pk"))
        .values("count")
    )
    return (
        user.tasks.filter(trash_unit__isnull=False)
        .exclude(parent__trash_unit=F("trash_unit"))
        .exclude(project__trash_unit=F("trash_unit"))
        .annotate(
            project_name=F("project__name"),
            subtask_count=Subquery(members) - 1,
            expires_at=expires_at(),
        )
        .order_by("-deleted_at", "-id")
    )


def expires_at() -> ExpressionWrapper[CombinedExpression]:
    """Return when a row in Trash will be deleted for good, as a query expression."""
    return ExpressionWrapper(
        F("deleted_at") + Value(timedelta(days=settings.TRASH_RETENTION_DAYS)),
        output_field=DateTimeField(),
    )


def restore_task(user: User, task_id: int) -> Restored | None:
    """Bring back the Trash unit one of the user's trashed Tasks belongs to; None if there's none.

    A Task deleted along with its Project comes back only with the Project.

    The unit goes back under its parent if the parent is live and the unit still fits below it,
    else it becomes the last root of its Project; a unit whose Project is in Trash goes to the
    Inbox. An archived Project takes it back as it is. A root stays in its Section unless the
    Section was deleted or the root changed Project; then it comes back in No section.
    """
    task = (
        user.tasks.filter(pk=task_id, trash_unit__isnull=False)
        .exclude(project__trash_unit=F("trash_unit"))
        .first()
    )
    if task is None:
        return None
    head = _head(task)
    unit = list(user.tasks.filter(trash_unit=head.trash_unit))
    with transaction.atomic():
        _place(user, head, height=max(member.depth for member in unit) - head.depth)
        head.deleted_at = head.trash_unit = None
        fields = [
            "deleted_at",
            "trash_unit",
            "project",
            "parent",
            "section",
            "position",
            "updated_at",
        ]
        head.save(update_fields=fields)
        others = user.tasks.filter(pk__in=[member.pk for member in unit if member != head])
        reminders.update_tasks(
            others,
            deleted_at=None,
            trash_unit=None,
            project=head.project,
            updated_at=timezone.now(),
        )
        TaskActivity.objects.bulk_create(
            TaskActivity(task=member, kind=TaskActivity.Kind.RESTORED) for member in unit
        )
        reopen_ancestors(head)
    return Restored(task=as_rows(user.tasks.filter(pk=head.pk), user).get(), project=head.project)


def _head(task: Task) -> Task:
    """Return the Task its Trash unit was deleted through: the unit's topmost Task."""
    while task.parent is not None and task.parent.trash_unit == task.trash_unit:
        task = task.parent
    return task


def _place(user: User, head: Task, height: int) -> None:
    """Point a unit's head at where it goes back to, keeping its place when it can."""
    parent = head.parent
    if parent is not None and parent.deleted_at is None and parent.depth + 1 + height <= MAX_DEPTH:
        head.project = parent.project
        task_siblings(parent.project_id, parent.pk).lock()
        return
    project = head.project if head.project.deleted_at is None else services.inbox(user)
    roots = task_siblings(project.pk, None)
    if parent is None and project == head.project:
        roots.lock()
        return
    head.position = roots.last()
    if project != head.project:
        head.section = None
    head.project, head.parent = project, None
