"""Business rules for Attachments: files stored against a Task, recorded in its Activity.

Like the Task services, they reach Attachments only through the user's own Tasks, so another
user's ids behave as if they don't exist.
"""

from __future__ import annotations

import mimetypes
from typing import TYPE_CHECKING

from django.conf import settings
from django.db import transaction
from django.template.defaultfilters import filesizeformat

from apps.tasks.models import Attachment, TaskActivity

if TYPE_CHECKING:
    from django.core.files.uploadedfile import UploadedFile
    from django.db.models import QuerySet

    from apps.accounts.models import User
    from apps.tasks.models import Task


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
