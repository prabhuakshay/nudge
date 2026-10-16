"""Tests for the Today and Upcoming views, judged by a frozen clock in the user's time zone."""

from __future__ import annotations

from datetime import UTC, date, datetime, time
from typing import TYPE_CHECKING

import pytest
from django.test import Client

from apps.accounts.services import set_time_zone
from apps.tasks import creation, projects, services
from apps.tasks.dates import TaskDates
from apps.tasks.models import Task

if TYPE_CHECKING:
    from collections.abc import Callable

    from apps.accounts.models import User

# 15 October 2026, 12:00 in Kolkata (UTC+05:30).
NOON = datetime(2026, 10, 15, 6, 30, tzinfo=UTC)


@pytest.fixture
def kolkata(ada: User) -> User:
    """Ada in UTC+05:30, so her day ends while it's still the same day in UTC."""
    return set_time_zone(ada, "Asia/Kolkata")


def _task(user: User, title: str, dates: TaskDates | None = None) -> Task:
    task = creation.create_task(services.inbox(user), title)
    if dates is not None:
        services.update_task(user, task.pk, services.TaskEdit(dates=dates))
    return task


def _due(day: int, hour: int | None = None) -> TaskDates:
    return TaskDates(
        due_date=date(2026, 10, day),
        due_time=None if hour is None else time(hour),
    )


def _view(client: Client, view: str, *, closed: bool = False) -> list[str]:
    query = f"view={view}&closed=true" if closed else f"view={view}"
    response = client.get(f"/api/v1/tasks?{query}")
    assert response.status_code == 200
    return [item["title"] for item in response.json()["items"]]


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("now", "views"),
    [
        (datetime(2026, 10, 15, 18, 29, tzinfo=UTC), (["Due today"], ["Due tomorrow"])),
        (datetime(2026, 10, 15, 18, 30, tzinfo=UTC), (["Due today", "Due tomorrow"], [])),
    ],
    ids=["23:59 in Kolkata", "midnight in Kolkata"],
)
def test_midnight_in_the_users_zone_moves_tasks_between_the_views(
    client: Client,
    kolkata: User,
    freeze_time: Callable[[datetime], None],
    now: datetime,
    views: tuple[list[str], list[str]],
) -> None:
    _task(kolkata, "Due today", _due(15))
    _task(kolkata, "Due tomorrow", _due(16))

    freeze_time(now)

    assert (_view(client, "today"), _view(client, "upcoming")) == views


@pytest.mark.django_db
@pytest.mark.parametrize("path", ["/api/v1/tasks?view=today", "/api/v1/tasks?view=upcoming"])
def test_the_views_require_a_session(path: str) -> None:
    assert Client().get(path).status_code == 401


@pytest.mark.django_db
def test_today_lists_overdue_then_due_today_then_ranges_that_include_today(
    client: Client,
    kolkata: User,
    freeze_time: Callable[[datetime], None],
) -> None:
    _task(kolkata, "Due today", _due(15))
    _task(
        kolkata,
        "Trip",
        TaskDates(start_date=date(2026, 10, 14), due_date=date(2026, 10, 17)),
    )
    _task(kolkata, "Two days late", _due(13))
    _task(kolkata, "This morning", _due(15, 9))
    _task(kolkata, "Yesterday", _due(14))
    _task(kolkata, "Undated")
    _task(kolkata, "Next week", _due(22))

    freeze_time(NOON)

    assert _view(client, "today") == [
        "Two days late",
        "Yesterday",
        "This morning",
        "Trip",
        "Due today",
    ]


@pytest.mark.django_db
def test_a_day_lists_timed_tasks_by_time_then_all_day_tasks_by_priority_then_manual_order(
    client: Client,
    kolkata: User,
    freeze_time: Callable[[datetime], None],
) -> None:
    for title, hour, priority in [
        ("No priority", None, Task.Priority.NONE),
        ("P3", None, Task.Priority.P3),
        ("Later", 17, Task.Priority.NONE),
        ("P1", None, Task.Priority.P1),
        ("Earlier", 14, Task.Priority.P4),
    ]:
        task = _task(kolkata, title, _due(15, hour))
        services.update_task(kolkata, task.pk, services.TaskEdit(priority=priority))
    # Added last, so first in manual order among the Tasks without a Priority.
    _task(kolkata, "Newest", _due(15))

    freeze_time(NOON)

    assert _view(client, "today") == ["Earlier", "Later", "P1", "P3", "Newest", "No priority"]


@pytest.mark.django_db
def test_upcoming_lists_later_tasks_day_by_day_from_the_day_each_starts(
    client: Client,
    kolkata: User,
    freeze_time: Callable[[datetime], None],
) -> None:
    _task(kolkata, "Next month", TaskDates(due_date=date(2026, 11, 20)))
    _task(
        kolkata,
        "Conference",
        TaskDates(start_date=date(2026, 10, 17), due_date=date(2026, 10, 19)),
    )
    _task(kolkata, "Tomorrow", _due(16))
    _task(kolkata, "Due today", _due(15))
    _task(kolkata, "Saturday", _due(18))

    freeze_time(NOON)

    assert _view(client, "upcoming") == ["Tomorrow", "Conference", "Saturday", "Next month"]


@pytest.mark.django_db
def test_the_views_list_subtasks_flat_with_their_parents_title(
    client: Client,
    kolkata: User,
    freeze_time: Callable[[datetime], None],
) -> None:
    parent = _task(kolkata, "Move house")
    subtask = creation.create_subtask(parent, "Book the van").task
    services.update_task(kolkata, subtask.pk, services.TaskEdit(dates=_due(15)))

    freeze_time(NOON)
    items = client.get("/api/v1/tasks?view=today").json()["items"]

    assert [(item["title"], item["parent_title"]) for item in items] == [
        ("Book the van", "Move house"),
    ]


@pytest.mark.django_db
def test_the_views_leave_out_closed_trashed_and_archived_project_tasks(
    client: Client,
    kolkata: User,
    freeze_time: Callable[[datetime], None],
) -> None:
    _task(kolkata, "Open", _due(15))
    done = _task(kolkata, "Done", _due(15))
    services.update_task(kolkata, done.pk, services.TaskEdit(status=Task.Status.COMPLETED))
    blocked = _task(kolkata, "Blocked", _due(16))
    services.update_task(kolkata, blocked.pk, services.TaskEdit(status=Task.Status.BLOCKED))
    trashed = _task(kolkata, "Trashed", _due(15))
    Task.objects.filter(pk=trashed.pk).update(deleted_at=NOON)
    garden = projects.create_project(kolkata, "Garden")
    archived = creation.create_task(garden, "Archived")
    services.update_task(kolkata, archived.pk, services.TaskEdit(dates=_due(15)))
    projects.archive_project(kolkata, garden.pk)

    freeze_time(NOON)

    assert _view(client, "today") == ["Open"]
    assert _view(client, "upcoming") == ["Blocked"]


@pytest.mark.django_db
@pytest.mark.usefixtures("kolkata")
def test_the_views_never_show_another_users_tasks(
    client: Client,
    grace: User,
    freeze_time: Callable[[datetime], None],
) -> None:
    _task(grace, "Theirs today", _due(15))
    _task(grace, "Theirs tomorrow", _due(16))

    freeze_time(NOON)

    assert _view(client, "today") == []
    assert _view(client, "upcoming") == []


@pytest.mark.django_db
def test_today_lists_tasks_closed_today_newest_first(
    client: Client,
    kolkata: User,
    freeze_time: Callable[[datetime], None],
) -> None:
    for title, closed_at in [
        # 23:59 yesterday in Kolkata.
        ("Closed yesterday", datetime(2026, 10, 14, 18, 29, tzinfo=UTC)),
        # 00:00 today in Kolkata.
        ("Closed at midnight", datetime(2026, 10, 14, 18, 30, tzinfo=UTC)),
        ("Closed this morning", datetime(2026, 10, 15, 3, 30, tzinfo=UTC)),
    ]:
        task = _task(kolkata, title, _due(14))
        freeze_time(closed_at)
        services.update_task(kolkata, task.pk, services.TaskEdit(status=Task.Status.WONT_DO))
    early = _task(kolkata, "Done early", _due(20))
    services.update_task(kolkata, early.pk, services.TaskEdit(status=Task.Status.COMPLETED))

    freeze_time(NOON)

    assert _view(client, "today", closed=True) == ["Closed this morning", "Closed at midnight"]


@pytest.mark.django_db
def test_upcoming_has_no_closed_tasks(
    client: Client,
    kolkata: User,
    freeze_time: Callable[[datetime], None],
) -> None:
    early = _task(kolkata, "Done early", _due(20))
    services.update_task(kolkata, early.pk, services.TaskEdit(status=Task.Status.COMPLETED))

    freeze_time(NOON)

    assert _view(client, "upcoming", closed=True) == []


@pytest.mark.django_db
@pytest.mark.parametrize(
    "query",
    ["", "?view=today&project=1", "?view=today&person=1", "?view=someday"],
    ids=["neither", "project and view", "person and view", "unknown view"],
)
def test_a_list_needs_one_project_person_or_known_view(client: Client, query: str) -> None:
    response = client.get(f"/api/v1/tasks{query}")

    assert response.status_code == 422


@pytest.mark.django_db
def test_the_sidebar_counts_open_tasks_in_today_with_overdue_and_in_upcoming(
    client: Client,
    kolkata: User,
    freeze_time: Callable[[datetime], None],
) -> None:
    _task(kolkata, "Late", _due(10))
    _task(kolkata, "Due today", _due(15))
    _task(kolkata, "Tomorrow", _due(16))
    done = _task(kolkata, "Done", _due(15))
    services.update_task(kolkata, done.pk, services.TaskEdit(status=Task.Status.COMPLETED))

    freeze_time(NOON)
    sidebar = client.get("/api/v1/sidebar").json()

    assert (sidebar["today_count"], sidebar["upcoming_count"]) == (2, 1)


@pytest.mark.django_db
@pytest.mark.parametrize("due_date", ["2026-10-15", "2026-10-16"])
def test_quick_add_can_date_the_new_task(client: Client, ada: User, due_date: str) -> None:
    response = client.post(
        "/api/v1/tasks",
        {"title": "Call the bank", "dates": {"due_date": due_date}},
        content_type="application/json",
    )

    assert response.status_code == 201
    assert response.json()["due_date"] == due_date
    assert response.json()["project_id"] == services.inbox(ada).pk
