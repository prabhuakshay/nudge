"""The history of changes to a Task."""

from __future__ import annotations

from typing import ClassVar, override

from django.db import models
from django.utils import timezone

from apps.tasks.models.tasks import Task


class TaskActivity(models.Model):
    """One event in a Task's history, written by a service in the same transaction as the change.

    `data` holds the event's details, shaped per `kind`; `apps.tasks.schemas.activity` types
    each shape.
    """

    class Kind(models.TextChoices):
        """What happened to the Task."""

        CREATED = "created", "Created"
        TITLE_CHANGED = "title_changed", "Title changed"
        DESCRIPTION_EDITED = "description_edited", "Description edited"
        DATES_CHANGED = "dates_changed", "Dates changed"
        STATUS_CHANGED = "status_changed", "Status changed"
        PRIORITY_CHANGED = "priority_changed", "Priority changed"
        PINNED = "pinned", "Pinned"
        UNPINNED = "unpinned", "Unpinned"
        ATTACHMENT_ADDED = "attachment_added", "Attachment added"
        ATTACHMENT_REMOVED = "attachment_removed", "Attachment removed"
        MOVED = "moved", "Moved"
        TAG_ADDED = "tag_added", "Tag added"
        TAG_REMOVED = "tag_removed", "Tag removed"
        TAGS_MERGED = "tags_merged", "Tags merged"
        PERSON_MERGED = "person_merged", "Person merged"
        REMINDERS_CHANGED = "reminders_changed", "Reminders changed"

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
