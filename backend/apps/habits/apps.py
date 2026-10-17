"""App configuration for `apps.habits`."""

from __future__ import annotations

from django.apps import AppConfig


class HabitsConfig(AppConfig):
    """Registers the habits app with Django."""

    name = "apps.habits"
    label = "habits"
