"""App configuration for `apps.core`."""

from __future__ import annotations

from django.apps import AppConfig


class CoreConfig(AppConfig):
    """Registers the core app with Django."""

    name = "apps.core"
    label = "core"
