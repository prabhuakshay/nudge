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
from apps.core.errors import NotFoundError
from apps.notifications.services import mark_read
from apps.tasks import services
from apps.tasks.models import Task

if TYPE_CHECKING:
    from apps.accounts.models import User
    from apps.tasks.changes import TaskChange
    from apps.tasks.models import Reminder

MORNING = time(9, 0)
NOTIFICATION_NOT_FOUND = "Reminder notification not found."


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


def _reminder(user: User, notification_id: int) -> Reminder:
    """Return the Reminder that sent one of the user's notifications.

    Raises:
        NotFoundError: The notification isn't the user's, or no Reminder sent it.
    """
    notification = (
        user.notifications.select_related("reminder")
        .filter(pk=notification_id, reminder__isnull=False)
        .first()
    )
    if notification is None or notification.reminder is None:
        raise NotFoundError(NOTIFICATION_NOT_FOUND)
    return notification.reminder


def snooze(user: User, notification_id: int, until: Snooze) -> None:
    """Fire the notification's Reminder once more later.

    The notification counts as read, since the user has dealt with it for now.

    Raises:
        NotFoundError: The notification isn't one of the user's Reminder notifications.
    """
    reminder = _reminder(user, notification_id)
    reminder.snoozed_until = snooze_end(user, until)
    reminder.save(update_fields=["snoozed_until"])
    mark_read(user, notification_id)


def snooze_end(user: User, until: Snooze) -> datetime:
    """Return when a snooze the user picks now ends; tomorrow morning is 09:00 in their zone."""
    now = timezone.now()
    if until in _DELAYS:
        return now + _DELAYS[until]
    zone = local_zone(user)
    tomorrow = now.astimezone(zone).date() + timedelta(days=1)
    return datetime.combine(tomorrow, MORNING, tzinfo=zone)


def complete(user: User, notification_id: int) -> TaskChange:
    """Complete the Task of the notification's Reminder, by the usual Status rules.

    The notification counts as read once the Task is complete.

    Raises:
        NotFoundError: The notification isn't one of the user's Reminder notifications, or its
            Task isn't live.
        ArchivedProjectError: The Task is in an archived Project.
        RepeatRuleError: The Task repeats and its Occurrence isn't due yet.
    """
    reminder = _reminder(user, notification_id)
    edit = services.TaskEdit(status=Task.Status.COMPLETED)
    change = services.update_task(user, reminder.task_id, edit)
    mark_read(user, notification_id)
    return change
