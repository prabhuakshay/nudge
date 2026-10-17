"""When a Habit asks to be done: its Frequency's rules, apart from storage and the clock."""

from __future__ import annotations

from typing import TYPE_CHECKING

from apps.habits.models import Habit

if TYPE_CHECKING:
    from datetime import date


def is_scheduled(habit: Habit, day: date) -> bool:
    """Whether the Habit asks to be done on this day: from its start date, on one of its days.

    A Habit done a number of times a week may be done on any day.
    """
    if day < habit.start_date:
        return False
    if habit.frequency == Habit.Frequency.WEEKDAYS:
        return day.isoweekday() in habit.weekdays
    return True


def is_week_met(habit: Habit, days_done: int) -> bool:
    """Whether a week with this many days that met the Goal is enough for the Habit.

    Only a Habit done a number of times a week has a target for the week.
    """
    return habit.times_per_week is not None and days_done >= habit.times_per_week
