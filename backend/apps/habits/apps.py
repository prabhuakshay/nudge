"""App configuration for `apps.habits`."""

from __future__ import annotations

from typing import override

from django.apps import AppConfig


class HabitsConfig(AppConfig):
    """Registers the habits app with Django and connects its signal handlers."""

    name = "apps.habits"
    label = "habits"

    @override
    def ready(self) -> None:
        """Connect the handler that moves Habit Reminders with the user's time zone."""
        from apps.habits import signals  # noqa: F401, PLC0415 - importing connects the handlers
