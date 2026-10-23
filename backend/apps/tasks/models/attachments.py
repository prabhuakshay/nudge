"""Files uploaded against a Task."""

from __future__ import annotations

import uuid
from typing import override

from django.db import models
from django.utils import timezone

from apps.tasks.models.tasks import Task

# Every Attachment's storage key starts with this folder, on disk and in a bucket.
ATTACHMENTS_FOLDER = "attachments"


def _attachment_key(attachment: Attachment, _filename: str) -> str:
    """Return a fresh storage key, so a file's name never reaches the file system."""
    return f"{ATTACHMENTS_FOLDER}/{attachment.task.owner_id}/{uuid.uuid4().hex}"


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
