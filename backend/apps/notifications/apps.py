"""App configuration for `apps.notifications`."""

from __future__ import annotations

from django.apps import AppConfig


class NotificationsConfig(AppConfig):
    """Registers the notifications app with Django."""

    name = "apps.notifications"
    label = "notifications"
