"""The Calendar View: the user's dated Tasks whose dates fall in a range of days.

Unlike Today and Upcoming, Closed Tasks come too, so the client can show or hide them without
asking again. Rows are flat: a dated Subtask shows on its own and names its parent. Repeating
Tasks also show where they come back after their current Occurrence.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from django.db.models import F
from django.db.models.functions import Coalesce

from apps.core.errors import DomainRuleError
from apps.tasks.archive import active_tasks
from apps.tasks.repeat import later_occurrences
from apps.tasks.rows import as_rows

if TYPE_CHECKING:
    from datetime import date

    from django.db.models import QuerySet

    from apps.accounts.models import User
    from apps.tasks.models import Task

# Six weeks: the most a Month grid shows. A bound keeps Repeat expansion over a range cheap.
MAX_DAYS = 42


class CalendarRangeError(DomainRuleError):
    """A range that ends before it starts, or is longer than the Calendar ever shows."""


@dataclass(frozen=True)
class Occurrence:
    """A day a repeating Task comes back on, after its current Occurrence."""

    task_id: int
    date: date


@dataclass(frozen=True)
class Calendar:
    """What a range of days shows: its Tasks, and the later Occurrences of repeating ones.

    `repeating` holds the Tasks the Occurrences belong to, since a Task's current Occurrence may
    be before the range, leaving it out of `items`.
    """

    items: list[Task]
    occurrences: list[Occurrence]
    repeating: list[Task]


def calendar(user: User, start: date, end: date) -> Calendar:
    """Return what the user's Calendar shows from `start` to `end`, both included.

    Raises:
        CalendarRangeError: `end` is before `start`, or the range is over `MAX_DAYS` long.
    """
    _check_range(start, end)
    repeating = _repeating(user, end)
    later = {task: later_occurrences(task, start, end) for task in repeating}
    return Calendar(
        items=list(_tasks(user, start, end)),
        occurrences=[Occurrence(task.pk, day) for task, days in later.items() for day in days],
        repeating=[task for task, days in later.items() if days],
    )


def _check_range(start: date, end: date) -> None:
    if end < start:
        message = "The range ends before it starts."
        raise CalendarRangeError(message)
    if (end - start).days + 1 > MAX_DAYS:
        message = f"Ask for at most {MAX_DAYS} days at a time."
        raise CalendarRangeError(message)


def _tasks(user: User, start: date, end: date) -> QuerySet[Task]:
    """Return the user's live dated Tasks whose dates overlap `start` to `end`, both included.

    A Task covers its due date, or for a range every day from its start date to its due date.
    They come by the day they start, all-day Tasks before timed ones, then in manual order.
    """
    covered = (
        active_tasks(user)
        .alias(first_day=Coalesce("start_date", "due_date"))
        .filter(first_day__lte=end, due_date__gte=start)
    )
    return as_rows(covered, user).order_by(
        F("first_day"),
        Coalesce("start_time", "due_time").asc(nulls_first=True),
        "position",
        "id",
    )


def _repeating(user: User, end: date) -> QuerySet[Task]:
    """Return the user's repeating Tasks whose series date is before `end`.

    Those are the ones that may come back by then; a moved Occurrence counts from the series date
    it stands for, wherever it was moved to.
    """
    repeating = (
        active_tasks(user)
        .exclude(repeat_rule="")
        .alias(series_date=Coalesce("occurrence_date", "due_date"))
        .filter(series_date__lt=end)
    )
    return as_rows(repeating.select_related("owner"), user).order_by("id")
