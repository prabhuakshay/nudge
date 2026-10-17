"""When a Habit asks to be done: its Frequency's rules, shared by Streaks, Today and Reminders.

Days are dates on the user's clock, and weeks run Monday to Sunday. Apart from `today`, these
rules don't touch storage or the clock.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import TYPE_CHECKING

from django.utils import timezone

from apps.accounts.services import local_zone

# Habit is only a type here: the model derives its Streak through this module.
if TYPE_CHECKING:
    from apps.accounts.models import User
    from apps.habits.models import Habit

DAYS_IN_WEEK = 7


def today(user: User) -> date:
    """Return today's date on the user's clock."""
    return timezone.now().astimezone(local_zone(user)).date()


def week_of(day: date) -> date:
    """Return the Monday that starts the day's week."""
    return day - timedelta(days=day.weekday())


def is_scheduled(habit: Habit, day: date) -> bool:
    """Whether the Habit asks to be done on this day: from its start date, on one of its days.

    A Habit done a number of times a week may be done on any day.
    """
    if day < habit.start_date:
        return False
    if habit.frequency == habit.Frequency.WEEKDAYS:
        return day.isoweekday() in habit.weekdays
    return True


def is_done(habit: Habit, count: int) -> bool:
    """Whether this many Check-ins on one day meet the Habit's Goal."""
    return count >= habit.goal


def is_week_met(habit: Habit, days_done: int) -> bool:
    """Whether a week with this many days that met the Goal is enough for the Habit.

    Only a Habit done a number of times a week has a target for the week.
    """
    return habit.times_per_week is not None and days_done >= habit.times_per_week
