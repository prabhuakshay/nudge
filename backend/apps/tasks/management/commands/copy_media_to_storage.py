"""Management command that copies Attachments from local disk into the configured bucket."""

from __future__ import annotations

from pathlib import Path
from typing import override

from django.conf import settings
from django.core.files import File
from django.core.files.storage import FileSystemStorage, default_storage
from django.core.management.base import BaseCommand, CommandError

from apps.tasks.models.attachments import ATTACHMENTS_FOLDER


class Command(BaseCommand):
    """Copy every local Attachment file to the default storage under the same key."""

    help = (
        "Copy Attachments from MEDIA_ROOT to the configured bucket. Files already there are "
        "skipped and local files are kept, so it is safe to run again."
    )

    @override
    def handle(self, *args: object, **options: object) -> None:
        """Copy the files and print how many were copied and skipped.

        Raises:
            CommandError: No bucket is configured, so there is nowhere to copy to.
        """
        if isinstance(default_storage, FileSystemStorage):
            message = "Attachments are on the file system: no bucket is configured to copy to."
            raise CommandError(message)
        copied = skipped = 0
        media_root = Path(settings.MEDIA_ROOT)
        for path in sorted((media_root / ATTACHMENTS_FOLDER).rglob("*")):
            if not path.is_file():
                continue
            key = path.relative_to(media_root).as_posix()
            if default_storage.exists(key):
                skipped += 1
                continue
            with path.open("rb") as local:
                default_storage.save(key, File(local))
            copied += 1
        self.stdout.write(f"Copied {copied}, skipped {skipped} already in storage.")
