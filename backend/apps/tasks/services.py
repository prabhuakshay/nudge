"""Business rules for Projects and Tasks: the Inbox, ordering, listing, dates and Activity.

Every function takes the user first and reaches Projects and Tasks through that user's related
managers, so another user's ids behave as if they don't exist. A change and the Activity event
that records it are saved in one transaction, so a Task's history never misses or invents a change.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from django.db import transaction
from django.db.models import Case, Q, When
from django.utils import timezone
from fractional_indexing import generate_key_between

from apps.accounts.services import local_zone
from apps.tasks.models import INBOX_NAME, Project, Task, TaskActivity
from apps.tasks.pagination import Page, newest_first

if TYPE_CHECKING:
    from datetime import date, time

    from django.db.models import QuerySet

    from apps.accounts.models import User


@dataclass(frozen=True)
class TaskChange:
    """A Task after a change, and the Tasks whose Status it changed, with their prior Status."""

    task: Task
    affected: list[tuple[int, Task.Status]]


@dataclass(frozen=True)
class TaskDates:
    """A Task's due date, time and range, as clock times in the owner's zone; all None = undated."""

    due_date: date | None = None
    due_time: time | None = None
    start_date: date | None = None
    start_time: time | None = None

    @classmethod
    def of(cls, task: Task) -> TaskDates:
        """Return the Task's current dates."""
        return cls(task.due_date, task.due_time, task.start_date, task.start_time)

    def as_activity(self) -> dict[str, str | None] | None:
        """Return the dates as Activity stores them: ISO strings, or None when undated."""
        if self.due_date is None:
            return None
        return {
            "due_date": self.due_date.isoformat(),
            "due_time": None if self.due_time is None else self.due_time.isoformat("minutes"),
            "start_date": None if self.start_date is None else self.start_date.isoformat(),
            "start_time": None if self.start_time is None else self.start_time.isoformat("minutes"),
        }


def create_inbox(user: User) -> Project:
    """Create the user's Inbox."""
    return Project.objects.create(owner=user, name=INBOX_NAME, is_inbox=True)


def inbox(user: User) -> Project:
    """Return the user's Inbox."""
    return user.projects.get(is_inbox=True)


def live_project(user: User, project_id: int) -> Project | None:
    """Return one of the user's Projects that isn't in Trash, or None."""
    return user.projects.filter(pk=project_id, deleted_at__isnull=True).first()


def _with_overdue(tasks: QuerySet[Task], user: User) -> QuerySet[Task]:
    """Annotate each Task with `is_overdue`, judged by the user's clock right now.

    Times are floating, so the comparison is on the user's local date and time: an all-day Task
    is overdue once its day ends, a timed one once its time passes, a range once its end passes.
    """
    now = timezone.now().astimezone(local_zone(user))
    overdue = Q(completed_at__isnull=True) & (
        Q(due_date__lt=now.date()) | Q(due_date=now.date(), due_time__lt=now.time())
    )
    return tasks.annotate(is_overdue=Case(When(overdue, then=True), default=False))


def _live_tasks(project: Project) -> QuerySet[Task]:
    return _with_overdue(project.tasks.filter(deleted_at__isnull=True), project.owner)


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
        task = Task.objects.create(
            owner_id=project.owner_id,
            project=project,
            title=title,
            position=position,
        )
        TaskActivity.objects.create(task=task, kind=TaskActivity.Kind.CREATED, at=task.created_at)
    return _with_overdue(project.tasks.all(), project.owner).get(pk=task.pk)


def live_task(user: User, task_id: int) -> Task | None:
    """Return one of the user's Tasks that isn't in Trash, or None."""
    return _with_overdue(user.tasks.filter(pk=task_id, deleted_at__isnull=True), user).first()


@dataclass(frozen=True)
class TaskPatch:
    """The fields of a Task to change; a field left as None stays as it is.

    `dates` replaces all of the Task's dates at once; an empty `TaskDates` removes them.
    """

    title: str | None = None
    description: str | None = None
    status: Task.Status | None = None
    dates: TaskDates | None = None


def update_task(user: User, task_id: int, patch: TaskPatch) -> TaskChange | None:
    """Change the given fields of one of the user's Tasks; return None if it isn't theirs.

    Completing a Task records when; reopening it clears that.
    """
    task = live_task(user, task_id)
    if task is None:
        return None
    changed: list[str] = []
    events: list[TaskActivity] = []
    if patch.title is not None and patch.title != task.title:
        events.append(
            TaskActivity(
                task=task,
                kind=TaskActivity.Kind.TITLE_CHANGED,
                data={"old": task.title, "new": patch.title},
            ),
        )
        task.title = patch.title
        changed.append("title")
    if patch.description is not None and patch.description != task.description:
        events.append(TaskActivity(task=task, kind=TaskActivity.Kind.DESCRIPTION_EDITED))
        task.description = patch.description
        changed.append("description")
    affected: list[tuple[int, Task.Status]] = []
    if patch.status is not None and patch.status != task.status:
        affected.append((task.pk, Task.Status(task.status)))
        task.status = patch.status
        task.completed_at = timezone.now() if patch.status == Task.Status.COMPLETED else None
        changed += ["status", "completed_at"]
    if patch.dates is not None and patch.dates != TaskDates.of(task):
        events.append(
            TaskActivity(
                task=task,
                kind=TaskActivity.Kind.DATES_CHANGED,
                data={"old": TaskDates.of(task).as_activity(), "new": patch.dates.as_activity()},
            ),
        )
        task.due_date, task.due_time = patch.dates.due_date, patch.dates.due_time
        task.start_date, task.start_time = patch.dates.start_date, patch.dates.start_time
        changed += ["due_date", "due_time", "start_date", "start_time"]
    with transaction.atomic():
        if changed:
            task.save(update_fields=[*changed, "updated_at"])
        TaskActivity.objects.bulk_create(events)
    # Re-read, because a change of dates or Status can change whether the Task is overdue.
    return TaskChange(task=_with_overdue(user.tasks.all(), user).get(pk=task.pk), affected=affected)


def task_activity(task: Task, cursor: str | None = None) -> Page[TaskActivity]:
    """Return a page of the Task's history, newest first.

    Raises:
        InvalidCursorError: The cursor wasn't one this function returned.
    """
    return newest_first(task.activity.all(), "at", cursor)


def activity_count(task: Task) -> int:
    """Return how many events the Task's history holds."""
    return task.activity.count()
