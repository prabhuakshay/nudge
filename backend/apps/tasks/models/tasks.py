"""Tasks, the things to do, and how their statuses group."""

from __future__ import annotations

from typing import ClassVar, override

from django.conf import settings
from django.db import models
from django.db.models import F, Q
from django.utils import timezone

from apps.tasks.models.projects import Project
from apps.tasks.models.sections import Section
from apps.tasks.models.tags import Tag

# Tasks nest four levels deep: a root at depth 0 and Subtasks down to depth 3.
MAX_DEPTH = 3


class Task(models.Model):
    """One thing to do, owned by one user and living in one of their Projects.

    `position` is a fractional-indexing key: a new Task gets a key between its neighbours, so
    reordering writes one row. Keys compare byte by byte, hence the C collation. Keys are scoped
    to a sibling set: the roots of one Project, or the Subtasks of one parent.

    A Subtask always lives in its root's Project, and Tasks nest at most `MAX_DEPTH` levels below
    a root. A Closed Task never has open descendants; the services keep it that way.

    A root Task can sit in one of its Project's Sections; null is No section. Only roots hold a
    Section: a Subtask's is its root's, so a tree is never split across Sections.

    Dates are floating: a time means that clock time in the owner's `time_zone`, wherever it is,
    so 09:00 stays 09:00 when the user travels. A due date without a time is all-day; a start
    date turns the Task into a range that ends on the due date.

    A dated root Task can Repeat: closing it moves the same row on to its next Occurrence rather
    than closing it; see `apps.tasks.repeat`.

    Completed and Won't do are Closed and record when in `completed_at`. Blocked is still open
    work, and only a Blocked Task keeps a `blocked_reason`. A pinned Task records when in
    `pinned_at` and lists above the rest, oldest pin first.

    A Task in Trash records when in `deleted_at`. Everything one delete sent to Trash shares a
    `trash_unit`, so the Trash lists it as one row and restores it as one.
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

    class RepeatFrom(models.TextChoices):
        """What a repeating Task's next Occurrence counts from."""

        DUE = "due", "Due date"
        COMPLETION = "completion", "Completion date"
        CALENDAR = "calendar", "Calendar"

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="tasks",
    )
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="tasks")
    parent = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="subtasks",
    )
    section = models.ForeignKey(
        Section,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="tasks",
    )
    position = models.CharField(max_length=255, db_collation="C")
    title = models.CharField(max_length=500)
    description = models.TextField(blank=True, default="")
    status = models.CharField(max_length=16, choices=Status, default=Status.OPEN)
    blocked_reason = models.TextField(blank=True, default="")
    priority = models.PositiveSmallIntegerField(choices=Priority, default=Priority.NONE)
    completed_at = models.DateTimeField(null=True, blank=True)
    pinned_at = models.DateTimeField(null=True, blank=True)
    due_date = models.DateField(null=True, blank=True)
    due_time = models.TimeField(null=True, blank=True, help_text="Empty for an all-day Task.")
    start_date = models.DateField(null=True, blank=True, help_text="Set for a range.")
    start_time = models.TimeField(null=True, blank=True)
    repeat_rule = models.CharField(
        max_length=500,
        blank=True,
        default="",
        help_text="An RFC 5545 RRULE; empty when the Task doesn't repeat.",
    )
    repeat_anchor = models.DateField(
        null=True,
        blank=True,
        help_text="The day the series starts (its DTSTART), at the Task's due time.",
    )
    repeat_from = models.CharField(max_length=16, choices=RepeatFrom, default=RepeatFrom.CALENDAR)
    tags = models.ManyToManyField(Tag, blank=True, related_name="tasks")
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)
    deleted_at = models.DateTimeField(null=True, blank=True)
    trash_unit = models.UUIDField(null=True, blank=True, db_index=True)

    class Meta:
        """Model options."""

        ordering = ("position", "id")
        indexes: ClassVar = [
            models.Index(fields=["project", "position"], name="task_project_position_idx"),
            models.Index(fields=["project", "-completed_at"], name="task_project_completed_idx"),
            models.Index(fields=["parent", "position"], name="task_parent_position_idx"),
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
            models.CheckConstraint(
                condition=Q(repeat_rule="")
                | Q(parent__isnull=True, due_date__isnull=False, repeat_anchor__isnull=False),
                name="tasks_task_repeat_needs_dated_root",
            ),
            models.CheckConstraint(
                condition=Q(section__isnull=True) | Q(parent__isnull=True),
                name="tasks_task_section_only_on_roots",
            ),
        ]

    @override
    def __str__(self) -> str:
        """Return the title, which is what the user sees in every list."""
        return self.title

    @property
    def depth(self) -> int:
        """Return how many parents the Task has: 0 for a root, up to `MAX_DEPTH`."""
        depth, parent = 0, self.parent
        while parent is not None:
            depth, parent = depth + 1, parent.parent
        return depth

    @property
    def parent_title(self) -> str | None:
        """Return the parent's title, which flat lists show as a breadcrumb; None for a root."""
        return None if self.parent is None else self.parent.title


# Blocked work is still to be done, so it sorts and counts with open Tasks.
OPEN_STATUSES = (Task.Status.OPEN, Task.Status.BLOCKED)
CLOSED_STATUSES = (Task.Status.COMPLETED, Task.Status.WONT_DO)
