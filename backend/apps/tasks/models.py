"""Database models for Tasks and the Projects that hold them."""

from __future__ import annotations

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
