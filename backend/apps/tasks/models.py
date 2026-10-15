"""Database models for Tasks and the Projects that hold them."""

from __future__ import annotations

from typing import ClassVar, override

from django.conf import settings
from django.db import models
from django.db.models import F, Q
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

    Dates are floating: a time means that clock time in the owner's `time_zone`, wherever it is,
    so 09:00 stays 09:00 when the user travels. A due date without a time is all-day; a start
    date turns the Task into a range that ends on the due date.

    Completed and Won't do are Closed and record when in `completed_at`. Blocked is still open
    work, and only a Blocked Task keeps a `blocked_reason`.
    """

    class Status(models.TextChoices):
        """Where a Task stands."""

        OPEN = "open", "Open"
        COMPLETED = "completed", "Completed"
        WONT_DO = "wont_do", "Won't do"
        BLOCKED = "blocked", "Blocked"

    class Priority(models.IntegerChoices):
        """How urgent a Task is; P1 is the most urgent."""

        NONE = 0, "None"
        P1 = 1, "P1"
        P2 = 2, "P2"
        P3 = 3, "P3"
        P4 = 4, "P4"

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
    blocked_reason = models.TextField(blank=True, default="")
    priority = models.PositiveSmallIntegerField(choices=Priority, default=Priority.NONE)
    completed_at = models.DateTimeField(null=True, blank=True)
    due_date = models.DateField(null=True, blank=True)
    due_time = models.TimeField(null=True, blank=True, help_text="Empty for an all-day Task.")
    start_date = models.DateField(null=True, blank=True, help_text="Set for a range.")
    start_time = models.TimeField(null=True, blank=True)
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
                condition=Q(status__in=["open", "blocked"], completed_at__isnull=True)
                | Q(status__in=["completed", "wont_do"], completed_at__isnull=False),
                name="tasks_task_completed_at_matches_status",
            ),
            models.CheckConstraint(
                condition=Q(start_date__isnull=True) | Q(due_date__isnull=False),
                name="tasks_task_start_needs_due",
            ),
            models.CheckConstraint(
                condition=(Q(due_time__isnull=True) | Q(due_date__isnull=False))
                & (Q(start_time__isnull=True) | Q(start_date__isnull=False)),
                name="tasks_task_time_needs_its_date",
            ),
            models.CheckConstraint(
                condition=Q(start_date__isnull=True)
                | Q(start_time__isnull=True, due_time__isnull=True)
                | Q(start_time__isnull=False, due_time__isnull=False),
                name="tasks_task_range_all_day_or_timed",
            ),
            models.CheckConstraint(
                condition=Q(start_date__isnull=True)
                | Q(start_date__lt=F("due_date"))
                | Q(start_date=F("due_date"), start_time__isnull=True)
                | Q(start_date=F("due_date"), start_time__lte=F("due_time")),
                name="tasks_task_range_starts_by_due",
            ),
            models.CheckConstraint(
                condition=Q(status="blocked") | Q(blocked_reason=""),
                name="tasks_task_blocked_reason_needs_blocked",
            ),
        ]

    @override
    def __str__(self) -> str:
        """Return the title, which is what the user sees in every list."""
        return self.title


# Blocked work is still to be done, so it sorts and counts with open Tasks.
OPEN_STATUSES = (Task.Status.OPEN, Task.Status.BLOCKED)
CLOSED_STATUSES = (Task.Status.COMPLETED, Task.Status.WONT_DO)


class TaskActivity(models.Model):
    """One event in a Task's history, written by a service in the same transaction as the change.

    `data` holds the event's details, shaped per `kind`; `apps.tasks.schemas` types each shape.
    """

    class Kind(models.TextChoices):
        """What happened to the Task."""

        CREATED = "created", "Created"
        TITLE_CHANGED = "title_changed", "Title changed"
        DESCRIPTION_EDITED = "description_edited", "Description edited"
        DATES_CHANGED = "dates_changed", "Dates changed"
        STATUS_CHANGED = "status_changed", "Status changed"
        PRIORITY_CHANGED = "priority_changed", "Priority changed"

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
