"""Markdown notes on a Task."""

from __future__ import annotations

from typing import override

from django.db import models
from django.utils import timezone

from apps.tasks.models.tasks import Task


class Comment(models.Model):
    """A markdown note on a Task, which may mention the user's People.

    Comments are a running log rather than history, so changing one isn't recorded in Activity and
    deleting one is for good. `updated_at` differs from `created_at` once the body is edited.
    """

    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name="comments")
    body = models.TextField(max_length=10_000)
    created_at = models.DateTimeField(default=timezone.now)
    # Not `auto_now`: the client shows "edited" when this differs from `created_at`, so a new
    # Comment must get the very same instant, and rewriting a Mention mustn't count as an edit.
    updated_at = models.DateTimeField(default=timezone.now)

    class Meta:
        """Model options."""

        ordering = ("created_at", "id")

    @override
    def __str__(self) -> str:
        """Return the start of the body, which is how the admin lists Comments."""
        return self.body[:50]
