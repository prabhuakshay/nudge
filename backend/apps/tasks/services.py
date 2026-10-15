"""Business rules for Projects and Tasks: Inbox, order, Status, dates, Attachments and Activity.

Every function takes the user first and reaches Projects and Tasks through that user's related
managers, so another user's ids behave as if they don't exist. A change and the Activity event
that records it are saved in one transaction, so a Task's history never misses or invents a change.
"""

from __future__ import annotations

import mimetypes
from dataclasses import dataclass
from typing import TYPE_CHECKING

from django.conf import settings
from django.db import transaction
from django.db.models import Case, Count, OuterRef, Q, Subquery, When
from django.db.models.functions import Coalesce
from django.template.defaultfilters import filesizeformat
from django.utils import timezone
from fractional_indexing import generate_key_between

from apps.accounts.services import local_zone
from apps.core.palette import PaletteColor
from apps.tasks.models import (
    CLOSED_STATUSES,
    INBOX_NAME,
    OPEN_STATUSES,
    Attachment,
    Project,
    Task,
    TaskActivity,
)
from apps.tasks.pagination import Page, newest_first

if TYPE_CHECKING:
    from datetime import date, time

    from django.core.files.uploadedfile import UploadedFile
    from django.db.models import QuerySet

    from apps.accounts.models import User


class TaskRuleError(Exception):
    """A change that would break a Task rule. The message says which, in the user's words."""


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


@dataclass(frozen=True)
class TaskEdit:
    """The fields of a Task to change; a field left as None stays as it is.

    `dates` replaces all of the Task's dates at once; an empty `TaskDates` removes them.
    """

    title: str | None = None
    description: str | None = None
    status: Task.Status | None = None
    blocked_reason: str | None = None
    priority: Task.Priority | None = None
    dates: TaskDates | None = None
    project: Project | None = None


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
    return Project.objects.create(
        owner=user,
        name=INBOX_NAME,
        color=PaletteColor.BLUE,
        icon=Project.Icon.INBOX,
        is_inbox=True,
    )


def inbox(user: User) -> Project:
    """Return the user's Inbox."""
    return user.projects.get(is_inbox=True)


def live_project(user: User, project_id: int) -> Project | None:
    """Return one of the user's Projects that isn't in Trash, or None."""
    return user.projects.filter(pk=project_id, deleted_at__isnull=True).first()


def _with_counts(tasks: QuerySet[Task]) -> QuerySet[Task]:
    # A subquery rather than a join: grouping would drop the model's default ordering.
    attachments = (
        Attachment.objects.filter(task=OuterRef("pk"))
        .order_by()
        .values("task")
        .annotate(count=Count("pk"))
        .values("count")
    )
    return tasks.annotate(attachment_count=Coalesce(Subquery(attachments), 0))


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
    return _with_overdue(_with_counts(project.tasks.filter(deleted_at__isnull=True)), project.owner)


def open_tasks(project: Project) -> QuerySet[Task]:
    """Return the Project's open and Blocked Tasks in the user's manual order."""
    return _live_tasks(project).filter(status__in=OPEN_STATUSES)


def closed_tasks(project: Project, cursor: str | None = None) -> Page[Task]:
    """Return a page of the Project's Closed Tasks, most recently completed first.

    Raises:
        InvalidCursorError: The cursor wasn't one this function returned.
    """
    closed = _live_tasks(project).filter(status__in=CLOSED_STATUSES)
    return newest_first(closed, "completed_at", cursor)


def _first_position(project: Project) -> str:
    """Return a key before every Task in the Project. Call it inside a transaction."""
    # Locking the Project serialises inserts into it, so two Tasks never get the same key.
    Project.objects.select_for_update().get(pk=project.pk)
    first = project.tasks.order_by("position", "id").values_list("position", flat=True).first()
    return str(generate_key_between(None, first))


def create_task(project: Project, title: str) -> Task:
    """Create a Task in the Project, first among its Tasks, owned by the Project's owner."""
    with transaction.atomic():
        task = Task.objects.create(
            owner_id=project.owner_id,
            project=project,
            title=title,
            position=_first_position(project),
        )
        TaskActivity.objects.create(task=task, kind=TaskActivity.Kind.CREATED, at=task.created_at)
    return _with_overdue(project.tasks.all(), project.owner).get(pk=task.pk)


def live_task(user: User, task_id: int) -> Task | None:
    """Return one of the user's Tasks that isn't in Trash, or None."""
    tasks = _with_counts(user.tasks.filter(pk=task_id, deleted_at__isnull=True))
    return _with_overdue(tasks, user).first()


_EDITABLE_FIELDS = (
    "title",
    "description",
    "status",
    "blocked_reason",
    "priority",
    "completed_at",
    "due_date",
    "due_time",
    "start_date",
    "start_time",
)


def update_task(user: User, task_id: int, edit: TaskEdit) -> TaskChange | None:
    """Change the given fields of one of the user's Tasks; return None if it isn't theirs.

    Moving it to another of the user's Projects puts it first there.

    Raises:
        TaskRuleError: The edit gives a Blocked reason to a Task that isn't Blocked.
    """
    task = live_task(user, task_id)
    if task is None:
        return None
    before = {name: getattr(task, name) for name in _EDITABLE_FIELDS}
    dates_before = TaskDates.of(task)
    _apply(task, edit)
    changed = [name for name in _EDITABLE_FIELDS if getattr(task, name) != before[name]]
    affected = []
    if "status" in changed:
        affected.append(
            AffectedTask(task.pk, Task.Status(before["status"]), before["blocked_reason"]),
        )
    events = _activity(task, before, dates_before)
    with transaction.atomic():
        if edit.project is not None and edit.project.pk != task.project_id:
            events.append(_moved(task, edit.project))
            task.position = _first_position(edit.project)
            task.project = edit.project
            changed += ["project", "position"]
        if changed:
            task.save(update_fields=[*changed, "updated_at"])
        TaskActivity.objects.bulk_create(events)
    # Re-read, because a change of dates or Status can change whether the Task is overdue.
    fresh = _with_overdue(_with_counts(user.tasks.all()), user).get(pk=task.pk)
    return TaskChange(task=fresh, affected=affected)


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
    if edit.dates is not None:
        task.due_date, task.due_time = edit.dates.due_date, edit.dates.due_time
        task.start_date, task.start_time = edit.dates.start_date, edit.dates.start_time


def _activity(
    task: Task,
    before: dict[str, object],
    dates_before: TaskDates,
) -> list[TaskActivity]:
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
    dates = TaskDates.of(task)
    if dates != dates_before:
        data = {"old": dates_before.as_activity(), "new": dates.as_activity()}
        events.append(TaskActivity(task=task, kind=TaskActivity.Kind.DATES_CHANGED, data=data))
    return events


def _moved(task: Task, project: Project) -> TaskActivity:
    return TaskActivity(
        task=task,
        kind=TaskActivity.Kind.MOVED,
        data={"from_project": task.project.name, "to_project": project.name},
    )


def task_activity(task: Task, cursor: str | None = None) -> Page[TaskActivity]:
    """Return a page of the Task's history, newest first.

    Raises:
        InvalidCursorError: The cursor wasn't one this function returned.
    """
    return newest_first(task.activity.all(), "at", cursor)


def activity_count(task: Task) -> int:
    """Return how many events the Task's history holds."""
    return task.activity.count()


class AttachmentTooLargeError(Exception):
    """The uploaded file is bigger than `ATTACHMENT_MAX_SIZE` allows."""


def attachments(task: Task) -> QuerySet[Attachment]:
    """Return the Task's Attachments, oldest first."""
    return task.attachments.all()


def attach_file(task: Task, upload: UploadedFile[bytes]) -> Attachment:
    """Store an uploaded file against the Task and record it in the Task's Activity.

    The content type comes from the file's name, never from the client, so the download serves
    a type the server chose.

    Raises:
        AttachmentTooLargeError: The file is bigger than `ATTACHMENT_MAX_SIZE`.
    """
    limit: int = settings.ATTACHMENT_MAX_SIZE
    size = upload.size or 0
    if size > limit:
        message = f"Files can be at most {filesizeformat(limit)}."
        raise AttachmentTooLargeError(message)
    name = upload.name or "file"
    content_type, _encoding = mimetypes.guess_type(name, strict=False)
    attachment = Attachment(
        task=task,
        name=name,
        size=size,
        content_type=content_type or "application/octet-stream",
    )
    with transaction.atomic():
        attachment.file.save(name, upload, save=False)
        attachment.save()
        TaskActivity.objects.create(
            task=task,
            kind=TaskActivity.Kind.ATTACHMENT_ADDED,
            data={"name": name},
        )
    return attachment


def live_attachment(user: User, attachment_id: int) -> Attachment | None:
    """Return one of the user's Attachments on a Task that isn't in Trash, or None."""
    return Attachment.objects.filter(
        pk=attachment_id,
        task__owner=user,
        task__deleted_at__isnull=True,
    ).first()


def delete_attachment(user: User, attachment_id: int) -> bool:
    """Delete one of the user's Attachments for good; return False if it isn't theirs.

    The file goes only once the deletion commits, so a rolled-back delete never loses it.
    """
    attachment = live_attachment(user, attachment_id)
    if attachment is None:
        return False
    with transaction.atomic():
        attachment.delete()
        TaskActivity.objects.create(
            task=attachment.task,
            kind=TaskActivity.Kind.ATTACHMENT_REMOVED,
            data={"name": attachment.name},
        )
        transaction.on_commit(lambda: attachment.file.delete(save=False))
    return True
