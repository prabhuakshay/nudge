"""Management command that checks Attachments can be stored, with a throwaway file."""

from __future__ import annotations

import uuid
from typing import override

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    """Write, read back and delete a test file in the storage Attachments use."""

    help = "Check that Attachments can be written to, read from and deleted from storage."

    @override
    def handle(self, *args: object, **options: object) -> None:
        """Round-trip a test file and print OK, or raise CommandError with the cause.

        Raises:
            CommandError: The storage refused a step or returned different contents.
        """
        content = f"Nudge storage check {uuid.uuid4().hex}".encode()
        try:
            read_back = _round_trip(content)
        except Exception as error:
            message = f"Storage check failed: {error}"
            raise CommandError(message) from error
        if read_back != content:
            message = "Storage check failed: the file read back differs from the one written."
            raise CommandError(message)
        self.stdout.write("Storage OK: wrote, read back and deleted a test file.")


def _round_trip(content: bytes) -> bytes:
    """Write the content to a unique test file and return what reading it back gives.

    The file is deleted even when reading fails, so a check never leaves anything behind.
    """
    key = default_storage.save(f"nudge-storage-check-{uuid.uuid4().hex}.txt", ContentFile(content))
    try:
        with default_storage.open(key, "rb") as stored:
            return bytes(stored.read())
    finally:
        default_storage.delete(key)
