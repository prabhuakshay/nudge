"""Business rules for Attachments: files stored against a Task, recorded in its Activity.

Like the Task services, they reach Attachments only through the user's own live Tasks, so another
user's ids behave as if they don't exist.
"""

from __future__ import annotations

import mimetypes
from typing import TYPE_CHECKING

from django.conf import settings
from django.db import transaction
from django.template.defaultfilters import filesizeformat

from apps.core.errors import NotFoundError
from apps.tasks import live
from apps.tasks.archive import ensure_writable
from apps.tasks.models import Attachment, TaskActivity

if TYPE_CHECKING:
    from django.core.files.uploadedfile import UploadedFile
    from django.db.models import QuerySet

    from apps.accounts.models import User

ATTACHMENT_NOT_FOUND = "Attachment not found."


class AttachmentTooLargeError(Exception):
    """The uploaded file is bigger than `ATTACHMENT_MAX_SIZE` allows."""


def attachments(user: User, task_id: int) -> QuerySet[Attachment]:
    """Return the Attachments of one of the user's live Tasks, oldest first.

    Raises:
        NotFoundError: The Task isn't one of the user's.
    """
    return live.task(user, task_id).attachments.all()


def attach_file(user: User, task_id: int, upload: UploadedFile[bytes]) -> Attachment:
    """Store an uploaded file against one of the user's live Tasks and record it in Activity.

    The content type comes from the file's name, never from the client, so the download serves
    a type the server chose.

    Raises:
        NotFoundError: The Task isn't one of the user's.
        AttachmentTooLargeError: The file is bigger than `ATTACHMENT_MAX_SIZE`.
        ArchivedProjectError: The Task is in an archived Project.
    """
    task = live.task(user, task_id)
    ensure_writable(task.project)
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


def live_attachment(user: User, attachment_id: int) -> Attachment:
    """Return one of the user's Attachments on a live Task.

    Raises:
        NotFoundError: The Attachment isn't one of the user's.
    """
    attachment = Attachment.objects.filter(pk=attachment_id, task__in=live.tasks(user)).first()
    if attachment is None:
        raise NotFoundError(ATTACHMENT_NOT_FOUND)
    return attachment


def delete_attachment(user: User, attachment_id: int) -> None:
    """Delete one of the user's Attachments on a live Task for good.

    The file goes only once the deletion commits, so a rolled-back delete never loses it.

    Raises:
        NotFoundError: The Attachment isn't one of the user's.
        ArchivedProjectError: The Attachment's Task is in an archived Project.
    """
    attachment = live_attachment(user, attachment_id)
    ensure_writable(attachment.task.project)
    with transaction.atomic():
        attachment.delete()
        TaskActivity.objects.create(
            task=attachment.task,
            kind=TaskActivity.Kind.ATTACHMENT_REMOVED,
            data={"name": attachment.name},
        )
        transaction.on_commit(lambda: attachment.file.delete(save=False))
