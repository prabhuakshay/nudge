"""Tests for the Calendar View's range query: which Tasks a range of days shows."""

from __future__ import annotations

from datetime import UTC, date, datetime, time
from typing import TYPE_CHECKING

import pytest
from django.test import Client

from apps.accounts.services import set_time_zone
from apps.tasks import creation, projects, services, trash
from apps.tasks.dates import TaskDates
from apps.tasks.models import Task

if TYPE_CHECKING:
    from collections.abc import Callable

    from apps.accounts.models import User


def _task(user: User, title: str, dates: TaskDates | None = None) -> Task:
    task = creation.create_task(services.inbox(user), title)
    if dates is not None:
        services.update_task(user, task.pk, services.TaskEdit(dates=dates))
    return task


def _repeating(user: User, title: str, due: date, rule: str, repeat_from: Task.RepeatFrom) -> Task:
    task = _task(user, title, TaskDates(due_date=due))
    edit = services.TaskEdit(repeat_rule=rule, repeat_from=repeat_from)
    services.update_task(user, task.pk, edit)
    return task


def _occurrences(client: Client, start: str, end: str) -> list[tuple[int, str]]:
    response = client.get(f"/api/v1/tasks/calendar?start={start}&end={end}")
    assert response.status_code == 200
    return [(row["task_id"], row["date"]) for row in response.json()["occurrences"]]


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


@pytest.mark.django_db
def test_a_weekly_task_shows_its_later_occurrences_but_not_its_current_one(
    client: Client,
    ada: User,
) -> None:
    gym = _repeating(ada, "Gym", date(2026, 10, 15), "FREQ=WEEKLY", Task.RepeatFrom.DUE)

    assert _occurrences(client, "2026-10-12", "2026-11-08") == [
        (gym.pk, "2026-10-22"),
        (gym.pk, "2026-10-29"),
        (gym.pk, "2026-11-05"),
    ]


@pytest.mark.django_db
def test_a_series_that_ends_inside_the_range_shows_no_occurrences_after_its_end(
    client: Client,
    ada: User,
) -> None:
    gym = _repeating(ada, "Gym", date(2026, 10, 15), "FREQ=WEEKLY;COUNT=3", Task.RepeatFrom.DUE)

    assert _occurrences(client, "2026-10-12", "2026-11-08") == [
        (gym.pk, "2026-10-22"),
        (gym.pk, "2026-10-29"),
    ]


@pytest.mark.django_db
def test_a_task_due_before_the_range_shows_the_occurrences_inside_it(
    client: Client,
    ada: User,
) -> None:
    rent = _repeating(ada, "Rent", date(2026, 9, 1), "FREQ=MONTHLY", Task.RepeatFrom.DUE)
    _repeating(ada, "Later", date(2026, 11, 20), "FREQ=DAILY", Task.RepeatFrom.DUE)

    assert _occurrences(client, "2026-10-01", "2026-10-31") == [(rent.pk, "2026-10-01")]


@pytest.mark.django_db
def test_a_task_that_repeats_from_completion_shows_no_later_occurrences(
    client: Client,
    ada: User,
) -> None:
    _repeating(ada, "Haircut", date(2026, 10, 15), "FREQ=WEEKLY", Task.RepeatFrom.COMPLETION)

    assert _occurrences(client, "2026-10-12", "2026-11-08") == []


@pytest.mark.django_db
def test_another_users_occurrences_are_never_shown(client: Client, grace: User) -> None:
    _repeating(grace, "Grace's", date(2026, 10, 15), "FREQ=DAILY", Task.RepeatFrom.DUE)

    assert _occurrences(client, "2026-10-12", "2026-11-08") == []


@pytest.mark.django_db
def test_an_overdue_task_repeating_on_the_calendar_skips_the_days_up_to_today(
    client: Client,
    ada: User,
    freeze_time: Callable[[datetime], None],
) -> None:
    freeze_time(datetime(2026, 10, 15, 11, 0, tzinfo=UTC))
    set_time_zone(ada, "Europe/London")
    bins = _repeating(ada, "Bins", date(2026, 10, 1), "FREQ=WEEKLY", Task.RepeatFrom.CALENDAR)

    assert _occurrences(client, "2026-10-01", "2026-10-31") == [
        (bins.pk, "2026-10-22"),
        (bins.pk, "2026-10-29"),
    ]


@pytest.mark.django_db
def test_the_tasks_occurrences_belong_to_come_with_them(client: Client, ada: User) -> None:
    _repeating(ada, "Rent", date(2026, 9, 1), "FREQ=MONTHLY", Task.RepeatFrom.DUE)
    _repeating(ada, "Haircut", date(2026, 10, 15), "FREQ=WEEKLY", Task.RepeatFrom.COMPLETION)

    response = client.get("/api/v1/tasks/calendar?start=2026-10-01&end=2026-10-31")

    assert [row["title"] for row in response.json()["repeating"]] == ["Rent"]
