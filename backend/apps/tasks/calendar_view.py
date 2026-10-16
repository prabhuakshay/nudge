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

    task: Task
    date: date


def check_range(start: date, end: date) -> None:
    """Refuse a range the Calendar never shows.

    Raises:
        CalendarRangeError: `end` is before `start`, or the range is over `MAX_DAYS` long.
    """
    if end < start:
        message = "The range ends before it starts."
        raise CalendarRangeError(message)
    if (end - start).days + 1 > MAX_DAYS:
        message = f"Ask for at most {MAX_DAYS} days at a time."
        raise CalendarRangeError(message)


def calendar_tasks(user: User, start: date, end: date) -> QuerySet[Task]:
    """Return the user's live dated Tasks whose dates overlap `start` to `end`, both included.

    A Task covers its due date, or for a range every day from its start date to its due date.
    They come by the day they start, all-day Tasks before timed ones, then in manual order.

    Raises:
        CalendarRangeError: `end` is before `start`, or the range is over `MAX_DAYS` long.
    """
    check_range(start, end)
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


def calendar_occurrences(user: User, start: date, end: date) -> list[Occurrence]:
    """Return the later Occurrences of the user's repeating Tasks from `start` to `end`.

    Each holds its Task as a row, since the Task's current Occurrence may be outside the range.

    Raises:
        CalendarRangeError: `end` is before `start`, or the range is over `MAX_DAYS` long.
    """
    check_range(start, end)
    repeating = active_tasks(user).exclude(repeat_rule="").filter(due_date__lt=end)
    return [
        Occurrence(task, day)
        for task in as_rows(repeating.select_related("owner"), user).order_by("id")
        for day in later_occurrences(task, start, end)
    ]
