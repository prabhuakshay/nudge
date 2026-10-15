"""Reminders that nudge the user about a Task."""

from __future__ import annotations

from typing import ClassVar, override

from django.db import models
from django.db.models import Q

from apps.tasks.models.tasks import Task


class Reminder(models.Model):
    """A nudge at a set offset from a Task's start (for a range) or due date and time.

    `offset` is signed, like an iCalendar alarm trigger: negative is before. An all-day Task counts
    from the start of its day, so +9 h is 09:00 on the day. `fire_at` is when the Reminder fires
    next, in UTC, worked out from the Task's dates and the owner's time zone; it is None when it
    won't fire: the Task is Closed, in Trash or in an archived Project, or the time has passed.
    `sent_at` is when it last fired.
    """

    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name="reminders")
    offset = models.DurationField()
    fire_at = models.DateTimeField(null=True, blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        """Model options."""

        ordering = ("offset", "id")
        indexes: ClassVar = [
            models.Index(
                fields=["fire_at"],
                condition=Q(fire_at__isnull=False),
                name="reminder_pending_fire_at_idx",
            ),
        ]
        constraints: ClassVar = [
            models.UniqueConstraint(fields=["task", "offset"], name="tasks_reminder_unique_offset"),
        ]

    @override
    def __str__(self) -> str:
        """Return the offset, which is how the user picked the Reminder."""
        return str(self.offset)
