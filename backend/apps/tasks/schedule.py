"""Today, Upcoming and All: the user's Tasks, sorted by where their dates fall on the user's clock.

Each view is one rule over the dates, applied to the user's live Tasks outside archived Projects.
All takes every Task, dated or not.
Times are floating, so "today" is the user's local date. Rows are flat: a matching Subtask shows
on its own and names its parent for a breadcrumb.
"""

from __future__ import annotations

from datetime import date, datetime, time
from enum import StrEnum
from typing import TYPE_CHECKING

from django.db.models import Case, F, IntegerField, Q, Value, When
from django.db.models.functions import Coalesce, Greatest

from apps.accounts.services import local_zone
from apps.tasks.archive import active_tasks
from apps.tasks.models import CLOSED_STATUSES, OPEN_STATUSES, Task
from apps.tasks.pagination import Page, newest_first
from apps.tasks.rows import as_rows, local_now, unpinned

if TYPE_CHECKING:
    from django.db.models import QuerySet

    from apps.accounts.models import User


class View(StrEnum):
    """A list of Tasks picked by their dates rather than by Project."""

    TODAY = "today"
    UPCOMING = "upcoming"
    ALL = "all"


def _rule(view: View, today: date) -> Q:
    """Return which dates belong in the view."""
    if view is View.TODAY:
        # Due today or before (so Overdue), or a range that has started.
        return Q(due_date__lte=today) | Q(start_date__lte=today)
    if view is View.ALL:
        return Q()
    return Q(due_date__gt=today) & ~Q(start_date__lte=today)


def _in_view(user: User, view: View, today: date) -> QuerySet[Task]:
    return as_rows(active_tasks(user).filter(_rule(view, today)), user)


def view_tasks(user: User, view: View) -> QuerySet[Task]:
    """Return the user's open Tasks in the view, in the order the view lists them.

    Pinned Tasks come first, then Overdue Tasks, oldest first. Then Tasks go day by day, a range
    on the day it starts or today if it already has, and undated Tasks last. Within a day, timed
    Tasks come first by time, then all-day Tasks by Priority, then manual order.
    """
    today = local_now(user).date()
    starts = Coalesce("start_date", "due_date")
    day = Case(
        When(is_overdue=True, then="due_date"),
        # GREATEST ignores NULLs, so an undated Task would otherwise land on today.
        When(start_date__isnull=True, due_date__isnull=True, then=None),
        default=Greatest(starts, Value(today)),
    )
    return (
        _in_view(user, view, today)
        .filter(status__in=OPEN_STATUSES)
        .annotate(
            day=day,
            clock=Case(When(start_date=F("day"), then="start_time"), default="due_time"),
            # No Priority sorts after P4.
            urgency=Case(
                When(priority=Task.Priority.NONE, then=Value(5)),
                default="priority",
                output_field=IntegerField(),
            ),
        )
        .order_by(
            unpinned(),
            F("is_overdue").desc(),
            F("day").asc(nulls_last=True),
            F("clock").asc(nulls_last=True),
            "urgency",
            "position",
            "id",
        )
    )


def closed_today(user: User, cursor: str | None = None) -> Page[Task]:
    """Return a page of the Tasks in Today that were closed today, most recently closed first.

    Raises:
        InvalidCursorError: The cursor wasn't one this function returned.
    """
    today = local_now(user).date()
    midnight = datetime.combine(today, time.min, tzinfo=local_zone(user))
    closed = _in_view(user, View.TODAY, today).filter(
        status__in=CLOSED_STATUSES,
        completed_at__gte=midnight,
    )
    return newest_first(closed, "completed_at", cursor)


def open_count(user: User, view: View) -> int:
    """Return how many open Tasks the view lists, for the sidebar."""
    return view_tasks(user, view).count()
