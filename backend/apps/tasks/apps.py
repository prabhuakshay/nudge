"""App configuration for `apps.tasks`."""

from __future__ import annotations

from pathlib import Path
from typing import override

from django.apps import AppConfig
from django.conf import settings


class TasksConfig(AppConfig):
    """Registers the tasks app with Django, connects its signal handlers and readies uploads."""

    name = "apps.tasks"
    label = "tasks"

    @override
    def ready(self) -> None:
        """Connect the handler that gives every new user an Inbox; create the upload spool.

        Django won't create `FILE_UPLOAD_TEMP_DIR` itself, and a fresh media volume or bind
        mount starts empty, so the first big Attachment would fail without this.
        """
        from apps.tasks import signals  # noqa: F401, PLC0415 - importing connects the handlers

        Path(settings.FILE_UPLOAD_TEMP_DIR).mkdir(parents=True, exist_ok=True)
