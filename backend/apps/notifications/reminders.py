"""What Task Reminders and Habit Reminders share: how late one may fire, and the snooze options."""

from __future__ import annotations

from datetime import datetime, time, timedelta
from enum import StrEnum
from typing import TYPE_CHECKING

from django.utils import timezone

from apps.accounts.services import local_zone

if TYPE_CHECKING:
    from apps.accounts.models import User

# A Reminder this late (the worker was down) is dropped, so an outage doesn't end in a flood.
CATCH_UP = timedelta(hours=1)
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


def snooze_end(user: User, until: Snooze) -> datetime:
    """Return when a snooze the user picks now ends; tomorrow morning is 09:00 in their zone."""
    now = timezone.now()
    if until in _DELAYS:
        return now + _DELAYS[until]
    zone = local_zone(user)
    tomorrow = now.astimezone(zone).date() + timedelta(days=1)
    return datetime.combine(tomorrow, MORNING, tzinfo=zone)
