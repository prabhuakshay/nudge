"""Background jobs for notifications, run by the Procrastinate worker."""

from __future__ import annotations

from procrastinate.contrib.django import app

from apps.notifications import services


@app.task(name="notifications.push")
def push_notification(notification_id: int) -> None:
    """Push a notification to the user's devices."""
    services.push_to_devices(notification_id)
