"""A Habit's current and best Streak, always derived from its Frequency, start date and Check-ins.

Streaks are never stored, so a change to the Frequency, start date or Goal recomputes them.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta
from enum import StrEnum
from typing import TYPE_CHECKING

from apps.habits import schedule

if TYPE_CHECKING:
    from collections.abc import Callable, Mapping, Sequence
    from datetime import date

    from apps.habits.models import Habit


class StreakUnit(StrEnum):
    """What a Streak counts: done days, or weeks that met a times-a-week Habit's number."""

    DAYS = "days"
    WEEKS = "weeks"


@dataclass(frozen=True)
class Streak:
    """A Habit's current run of done days or met weeks, and its longest run ever."""

    current: int
    best: int
    unit: StreakUnit


def habit_streak(habit: Habit) -> Streak:
    """Return the Habit's Streak as of today on its owner's clock.

    Reads the Habit's Check-ins through `check_ins.all()`, so prefetch them for many Habits.
    """
    counts = {check_in.date: check_in.count for check_in in habit.check_ins.all()}
    return streak(habit, counts, schedule.today(habit.owner))


def streak(habit: Habit, counts: Mapping[date, int], on: date) -> Streak:
    """Return the Habit's Streak on a day, from `counts` of Check-ins per day.

    A daily or weekday Habit counts done scheduled days and skips the others; a times-a-week
    Habit counts weeks that met its number. The day or week in progress adds to the Streak once
    done but doesn't break it before it's over.
    """
    if habit.frequency == habit.Frequency.TIMES_PER_WEEK:
        this_week = schedule.week_of(on)
        weeks = _every(schedule.week_of(habit.start_date), this_week, step=schedule.DAYS_IN_WEEK)
        return _run(
            weeks,
            lambda week: schedule.is_week_met(habit, _days_done(habit, counts, week)),
            in_progress=this_week,
            unit=StreakUnit.WEEKS,
        )
    days = [
        day for day in _every(habit.start_date, on, step=1) if schedule.is_scheduled(habit, day)
    ]
    return _run(
        days,
        lambda day: schedule.is_done(habit, counts.get(day, 0)),
        in_progress=on,
        unit=StreakUnit.DAYS,
    )


def _days_done(habit: Habit, counts: Mapping[date, int], monday: date) -> int:
    week = _every(monday, monday + timedelta(days=schedule.DAYS_IN_WEEK - 1), step=1)
    return sum(
        1
        for day in week
        if schedule.is_scheduled(habit, day) and schedule.is_done(habit, counts.get(day, 0))
    )


def _every(first: date, last: date, *, step: int) -> list[date]:
    count = (last - first).days // step + 1
    return [first + timedelta(days=step * index) for index in range(max(count, 0))]


def _run(
    periods: Sequence[date],
    met: Callable[[date], bool],
    *,
    in_progress: date,
    unit: StreakUnit,
) -> Streak:
    current = best = 0
    for period in periods:
        if met(period):
            current += 1
            best = max(best, current)
        elif period != in_progress:
            current = 0
    return Streak(current, best, unit)
