"""App configuration for `apps.tasks`."""

from __future__ import annotations

from typing import override

from django.apps import AppConfig


class TasksConfig(AppConfig):
    """Registers the tasks app with Django and connects its signal handlers."""

    name = "apps.tasks"
    label = "tasks"

    @override
    def ready(self) -> None:
        """Connect the handler that gives every new user an Inbox."""
        from apps.tasks import signals  # noqa: F401, PLC0415 - importing connects the handlers
