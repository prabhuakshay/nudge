"""Database models for Tasks and the Projects that hold them."""

from __future__ import annotations

import uuid
from typing import ClassVar, override

from django.conf import settings
from django.db import models
from django.db.models import Q
from django.utils import timezone

INBOX_NAME = "Inbox"


class Project(models.Model):
    """A named container of Tasks owned by one user.

    Every user has exactly one Inbox: a real Project row flagged `is_inbox`, so a Task always
    has a Project and every Project query works the same for the Inbox.
    """

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="projects",
    )
    name = models.CharField(max_length=64)
    is_inbox = models.BooleanField(default=False)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        """Model options."""

        constraints: ClassVar = [
            models.UniqueConstraint(
                fields=["owner"],
                condition=Q(is_inbox=True),
                name="tasks_project_one_inbox_per_owner",
            ),
        ]

    @override
    def __str__(self) -> str:
        """Return the name, which is how the user tells Projects apart."""
        return self.name


class Task(models.Model):
    """One thing to do, owned by one user and living in one of their Projects.

    `position` is a fractional-indexing key: a new Task gets a key between its neighbours, so
    reordering writes one row. Keys compare byte by byte, hence the C collation.
    """

    class Status(models.TextChoices):
        """Where a Task stands."""

        OPEN = "open", "Open"
        COMPLETED = "completed", "Completed"

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="tasks",
    )
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="tasks")
    position = models.CharField(max_length=255, db_collation="C")
    title = models.CharField(max_length=500)
    description = models.TextField(blank=True, default="")
    status = models.CharField(max_length=16, choices=Status, default=Status.OPEN)
    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        """Model options."""

        ordering = ("position", "id")
        indexes: ClassVar = [
            models.Index(fields=["project", "position"], name="task_project_position_idx"),
            models.Index(fields=["project", "-completed_at"], name="task_project_completed_idx"),
        ]
        constraints: ClassVar = [
            models.CheckConstraint(
                condition=Q(status="open", completed_at__isnull=True)
                | Q(status="completed", completed_at__isnull=False),
                name="tasks_task_completed_at_matches_status",
            ),
        ]

    @override
    def __str__(self) -> str:
        """Return the title, which is what the user sees in every list."""
        return self.title


class TaskActivity(models.Model):
    """One event in a Task's history, written by a service in the same transaction as the change.

    `data` holds the event's details, shaped per `kind`; `apps.tasks.schemas` types each shape.
    """

    class Kind(models.TextChoices):
        """What happened to the Task."""

        CREATED = "created", "Created"
        TITLE_CHANGED = "title_changed", "Title changed"
        DESCRIPTION_EDITED = "description_edited", "Description edited"
        ATTACHMENT_ADDED = "attachment_added", "Attachment added"
        ATTACHMENT_REMOVED = "attachment_removed", "Attachment removed"

    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name="activity")
    kind = models.CharField(max_length=32, choices=Kind)
    at = models.DateTimeField(default=timezone.now)
    data = models.JSONField(default=dict, blank=True)

    class Meta:
        """Model options."""

        verbose_name_plural = "task activity"
        indexes: ClassVar = [
            models.Index(fields=["task", "-at", "-id"], name="task_activity_newest_idx"),
        ]

    @override
    def __str__(self) -> str:
        """Return what happened, which is how the admin lists events."""
        return self.get_kind_display()


def _attachment_key(attachment: Attachment, _filename: str) -> str:
    """Return a fresh storage key, so a file's name never reaches the file system."""
    return f"attachments/{attachment.task.owner_id}/{uuid.uuid4().hex}"


class Attachment(models.Model):
    """A file uploaded against a Task.

    The original name lives only here; the stored file is named by a generated key. Deleting an
    Attachment is for good: the service removes its file once the deletion commits.
    """

    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name="attachments")
    name = models.CharField(max_length=255)
    size = models.PositiveBigIntegerField()
    content_type = models.CharField(max_length=255)
    file = models.FileField(upload_to=_attachment_key, max_length=255)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        """Model options."""

        ordering = ("created_at", "id")

    @override
    def __str__(self) -> str:
        """Return the file's original name, which is how the user knows it."""
        return self.name
