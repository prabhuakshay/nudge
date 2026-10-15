"""What the user can do from a fired Reminder's Notification: complete its Task or snooze it.

A snooze is a one-off extra firing of the Reminder, kept apart from its regular fire time, so it
never changes the Task and the sweep in `apps.tasks.reminders` fires it like any other.
"""

from __future__ import annotations

from datetime import datetime, time, timedelta
from enum import StrEnum
from typing import TYPE_CHECKING

from django.utils import timezone

from apps.accounts.services import local_zone
from apps.notifications.services import mark_read
from apps.tasks import services
from apps.tasks.models import Task

if TYPE_CHECKING:
    from apps.accounts.models import User
    from apps.notifications.models import Notification

MORNING = time(9, 0)


class Snooze(StrEnum):
    """How long to snooze a Reminder for."""

    IN_15_MINUTES = "in_15_minutes"
    IN_1_HOUR = "in_1_hour"
    IN_3_HOURS = "in_3_hours"
    TOMORROW_MORNING = "tomorrow_morning"


_DELAYS = {
    Snooze.IN_15_MINUTES: timedelta(minutes=15),
    Snooze.IN_1_HOUR: timedelta(hours=1),
    Snooze.IN_3_HOURS: timedelta(hours=3),
}


def _reminder_notification(user: User, notification_id: int) -> Notification | None:
    """Return one of the user's notifications that a Reminder sent, or None."""
    return (
        user.notifications.select_related("reminder")
        .filter(pk=notification_id, reminder__isnull=False)
        .first()
    )


def snooze(user: User, notification_id: int, until: Snooze) -> bool:
    """Fire the notification's Reminder once more later; return whether the notification exists.

    The notification counts as read, since the user has dealt with it for now.
    """
    notification = _reminder_notification(user, notification_id)
    if notification is None or notification.reminder is None:
        return False
    notification.reminder.snoozed_until = _snooze_end(user, until)
    notification.reminder.save(update_fields=["snoozed_until"])
    mark_read(user, notification.pk)
    return True


def _snooze_end(user: User, until: Snooze) -> datetime:
    now = timezone.now()
    if until in _DELAYS:
        return now + _DELAYS[until]
    zone = local_zone(user)
    tomorrow = now.astimezone(zone).date() + timedelta(days=1)
    return datetime.combine(tomorrow, MORNING, tzinfo=zone)


def complete(user: User, notification_id: int) -> services.TaskChange | None:
    """Complete the Task of the notification's Reminder, by the usual Status rules.

    Returns None if the notification or its Task isn't the user's. The notification counts as
    read once the Task is complete.

    Raises:
        ArchivedProjectError: The Task is in an archived Project.
        RepeatRuleError: The Task repeats and its Occurrence isn't due yet.
    """
    notification = _reminder_notification(user, notification_id)
    if notification is None or notification.reminder is None:
        return None
    edit = services.TaskEdit(status=Task.Status.COMPLETED)
    change = services.update_task(user, notification.reminder.task_id, edit)
    if change is not None:
        mark_read(user, notification.pk)
    return change
