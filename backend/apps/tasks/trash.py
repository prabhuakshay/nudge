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

from apps.core.errors import NotFoundError
from apps.tasks import live, placement, reminders, services
from apps.tasks.archive import ensure_writable
from apps.tasks.models import Project, Task, TaskActivity
from apps.tasks.rows import as_rows
from apps.tasks.tree import below, reopen_ancestors

if TYPE_CHECKING:
    from django.db.models import QuerySet
    from django.db.models.expressions import CombinedExpression

    from apps.accounts.models import User

TASK_NOT_IN_TRASH = "Task not found in Trash."


@dataclass(frozen=True)
class Restored:
    """A Task back from Trash, as a list row, and the Project it went back to."""

    task: Task
    project: Project


def trash_task(user: User, task_id: int) -> None:
    """Send one of the user's live Tasks and its live Subtasks to Trash.

    Subtasks trashed earlier on their own stay units of their own.

    Raises:
        NotFoundError: The Task isn't one of the user's.
        ArchivedProjectError: The Task is in an archived Project.
    """
    task = live.task(user, task_id)
    ensure_writable(task.project)
    now = timezone.now()
    with transaction.atomic():
        ids = [task.pk, *below([task]).values_list("pk", flat=True)]
        unit = user.tasks.filter(pk__in=ids)
        reminders.update_tasks(unit, deleted_at=now, trash_unit=uuid.uuid4(), updated_at=now)
        TaskActivity.objects.bulk_create(
            TaskActivity(task_id=pk, kind=TaskActivity.Kind.TRASHED, at=now) for pk in ids
        )


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


def restore_task(user: User, task_id: int) -> Restored:
    """Bring back the Trash unit one of the user's trashed Tasks belongs to.

    A Task deleted along with its Project comes back only with the Project.

    The unit goes back under its parent if the parent is live and the unit still fits below it,
    else it becomes the last root of its Project; a unit whose Project is in Trash goes to the
    Inbox. An archived Project takes it back as it is. A root stays in its Section unless the
    Section was deleted or the root changed Project; then it comes back in No section.

    Raises:
        NotFoundError: The Task isn't one of the user's Tasks in Trash.
    """
    task = (
        user.tasks.filter(pk=task_id, trash_unit__isnull=False)
        .exclude(project__trash_unit=F("trash_unit"))
        .first()
    )
    if task is None:
        raise NotFoundError(TASK_NOT_IN_TRASH)
    head = _head(task)
    unit = list(user.tasks.filter(trash_unit=head.trash_unit))
    with transaction.atomic():
        placement.return_from_trash(head, unit, services.inbox(user))
        reminders.update_tasks(
            user.tasks.filter(pk__in=[member.pk for member in unit]),
            deleted_at=None,
            trash_unit=None,
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
