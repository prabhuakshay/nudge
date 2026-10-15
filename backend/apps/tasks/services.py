"""Business rules for Projects and Tasks: Inbox, order, Status, Attachments and Activity.

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
from django.db.models import Count, OuterRef, Subquery
from django.db.models.functions import Coalesce
from django.template.defaultfilters import filesizeformat
from django.utils import timezone
from fractional_indexing import generate_key_between

from apps.tasks.models import INBOX_NAME, Attachment, Project, Task, TaskActivity
from apps.tasks.pagination import Page, newest_first

if TYPE_CHECKING:
    from django.core.files.uploadedfile import UploadedFile
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


def _live_tasks(project: Project) -> QuerySet[Task]:
    return _with_counts(project.tasks.filter(deleted_at__isnull=True))


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
        return task


def live_task(user: User, task_id: int) -> Task | None:
    """Return one of the user's Tasks that isn't in Trash, or None."""
    return _with_counts(user.tasks.filter(pk=task_id, deleted_at__isnull=True)).first()


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
    events: list[TaskActivity] = []
    if title is not None and title != task.title:
        events.append(
            TaskActivity(
                task=task,
                kind=TaskActivity.Kind.TITLE_CHANGED,
                data={"old": task.title, "new": title},
            ),
        )
        task.title = title
        changed.append("title")
    if description is not None and description != task.description:
        events.append(TaskActivity(task=task, kind=TaskActivity.Kind.DESCRIPTION_EDITED))
        task.description = description
        changed.append("description")
    affected: list[tuple[int, Task.Status]] = []
    if status is not None and status != task.status:
        affected.append((task.pk, Task.Status(task.status)))
        task.status = status
        task.completed_at = timezone.now() if status == Task.Status.COMPLETED else None
        changed += ["status", "completed_at"]
    with transaction.atomic():
        if changed:
            task.save(update_fields=[*changed, "updated_at"])
        TaskActivity.objects.bulk_create(events)
    return TaskChange(task=task, affected=affected)


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
