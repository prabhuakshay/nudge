"""Tests for the Calendar View's range query: which Tasks a range of days shows."""

from __future__ import annotations

from datetime import date, time
from typing import TYPE_CHECKING

import pytest
from django.test import Client

from apps.tasks import creation, projects, services, trash
from apps.tasks.dates import TaskDates
from apps.tasks.models import Task

if TYPE_CHECKING:
    from apps.accounts.models import User


def _task(user: User, title: str, dates: TaskDates | None = None) -> Task:
    task = creation.create_task(services.inbox(user), title)
    if dates is not None:
        services.update_task(user, task.pk, services.TaskEdit(dates=dates))
    return task


def _calendar(client: Client, start: str, end: str) -> list[str]:
    response = client.get(f"/api/v1/tasks/calendar?start={start}&end={end}")
    assert response.status_code == 200
    return [item["title"] for item in response.json()["items"]]


@pytest.mark.django_db
def test_a_task_due_inside_the_range_is_shown(client: Client, ada: User) -> None:
    _task(ada, "Due inside", TaskDates(due_date=date(2026, 10, 15)))
    _task(ada, "Due after", TaskDates(due_date=date(2026, 11, 1)))
    _task(ada, "Undated")

    assert _calendar(client, "2026-10-01", "2026-10-31") == ["Due inside"]


@pytest.mark.django_db
def test_a_timed_task_is_shown_on_its_day(client: Client, ada: User) -> None:
    _task(ada, "Call", TaskDates(due_date=date(2026, 10, 15), due_time=time(9, 30)))

    assert _calendar(client, "2026-10-15", "2026-10-15") == ["Call"]


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("start", "end", "expected"),
    [
        ("2026-10-12", "2026-10-18", ["Trip"]),
        ("2026-10-08", "2026-10-11", ["Trip"]),
        ("2026-10-19", "2026-10-25", ["Trip"]),
        ("2026-10-01", "2026-10-09", []),
        ("2026-10-21", "2026-10-31", []),
    ],
    ids=["inside", "crossing the start", "crossing the end", "before", "after"],
)
def test_a_range_is_shown_wherever_its_days_overlap(
    client: Client,
    ada: User,
    start: str,
    end: str,
    expected: list[str],
) -> None:
    _task(ada, "Trip", TaskDates(start_date=date(2026, 10, 10), due_date=date(2026, 10, 20)))

    assert _calendar(client, start, end) == expected


@pytest.mark.django_db
def test_both_edges_of_the_range_are_included(client: Client, ada: User) -> None:
    _task(ada, "First day", TaskDates(due_date=date(2026, 10, 1)))
    _task(ada, "Last day", TaskDates(due_date=date(2026, 10, 7)))

    assert _calendar(client, "2026-10-01", "2026-10-07") == ["First day", "Last day"]


@pytest.mark.django_db
def test_tasks_come_by_day_with_all_day_tasks_before_timed_ones(
    client: Client,
    ada: User,
) -> None:
    _task(ada, "Wednesday", TaskDates(due_date=date(2026, 10, 14)))
    _task(ada, "Tuesday at nine", TaskDates(due_date=date(2026, 10, 13), due_time=time(9)))
    _task(ada, "Tuesday", TaskDates(due_date=date(2026, 10, 13)))

    assert _calendar(client, "2026-10-12", "2026-10-18") == [
        "Tuesday",
        "Tuesday at nine",
        "Wednesday",
    ]


@pytest.mark.django_db
def test_a_dated_subtask_is_shown_on_its_own_with_its_parent(client: Client, ada: User) -> None:
    parent = _task(ada, "Move house")
    subtask = creation.create_subtask(parent, "Book the van").task
    due = services.TaskEdit(dates=TaskDates(due_date=date(2026, 10, 15)))
    services.update_task(ada, subtask.pk, due)

    response = client.get("/api/v1/tasks/calendar?start=2026-10-01&end=2026-10-31")

    [row] = response.json()["items"]
    assert (row["title"], row["parent_title"]) == ("Book the van", "Move house")


@pytest.mark.django_db
def test_closed_tasks_are_shown(client: Client, ada: User) -> None:
    done = _task(ada, "Done", TaskDates(due_date=date(2026, 10, 15)))
    services.update_task(ada, done.pk, services.TaskEdit(status=Task.Status.COMPLETED))
    skipped = _task(ada, "Skipped", TaskDates(due_date=date(2026, 10, 16)))
    services.update_task(ada, skipped.pk, services.TaskEdit(status=Task.Status.WONT_DO))

    assert _calendar(client, "2026-10-01", "2026-10-31") == ["Done", "Skipped"]


@pytest.mark.django_db
def test_trashed_tasks_and_archived_projects_are_left_out(client: Client, ada: User) -> None:
    due = TaskDates(due_date=date(2026, 10, 15))
    trashed = _task(ada, "Trashed", due)
    trash.trash_task(ada, trashed.pk)
    garden = projects.create_project(ada, "Garden")
    creation.create_task(garden, "Archived", creation.NewTask(dates=due))
    projects.archive_project(ada, garden.pk)

    assert _calendar(client, "2026-10-01", "2026-10-31") == []


@pytest.mark.django_db
def test_another_users_tasks_are_never_shown(client: Client, grace: User) -> None:
    _task(grace, "Grace's", TaskDates(due_date=date(2026, 10, 15)))

    assert _calendar(client, "2026-10-01", "2026-10-31") == []


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("start", "end", "detail"),
    [
        ("2026-10-10", "2026-10-09", "The range ends before it starts."),
        ("2026-10-01", "2026-11-12", "Ask for at most 42 days at a time."),
    ],
    ids=["ends before it starts", "longer than six weeks"],
)
def test_a_range_the_calendar_never_shows_is_refused(
    client: Client,
    start: str,
    end: str,
    detail: str,
) -> None:
    response = client.get(f"/api/v1/tasks/calendar?start={start}&end={end}")

    assert response.status_code == 422
    assert response.json() == {"detail": detail}


@pytest.mark.django_db
def test_six_weeks_is_the_longest_range(client: Client) -> None:
    response = client.get("/api/v1/tasks/calendar?start=2026-10-01&end=2026-11-11")

    assert response.status_code == 200


@pytest.mark.django_db
def test_the_calendar_requires_a_session() -> None:
    response = Client().get("/api/v1/tasks/calendar?start=2026-10-01&end=2026-10-31")

    assert response.status_code == 401
