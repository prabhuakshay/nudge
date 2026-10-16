"""Tests for moving a repeating Task's current Occurrence alone, as a Calendar drag does."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING

import pytest
from django.test import Client

from apps.accounts.services import set_time_zone
from apps.tasks import creation, services
from apps.tasks.models import TaskActivity

if TYPE_CHECKING:
    from collections.abc import Callable
    from typing import Any

    from django.test.client import _MonkeyPatchedWSGIResponse as Response

    from apps.accounts.models import User
    from apps.tasks.models import Task

# Monday 12 October 2026, 12:00 in London. The Task's series falls on Thursdays.
NOW = datetime(2026, 10, 12, 11, 0, tzinfo=UTC)


@pytest.fixture
def freeze(ada: User, freeze_time: Callable[[datetime], None]) -> Callable[[datetime], None]:
    freeze_time(NOW)
    set_time_zone(ada, "Europe/London")
    return freeze_time


@pytest.fixture
def client(ada: User, freeze: Callable[[datetime], None]) -> Client:  # noqa: ARG001 - stops the clock first
    client = Client()
    client.force_login(ada)
    return client


@pytest.fixture
def task(ada: User) -> Task:
    return creation.create_task(services.inbox(ada), "Gym")


def _patch(client: Client, task_id: int, **fields: Any) -> Response:  # noqa: ANN401 - JSON body
    return client.patch(f"/api/v1/tasks/{task_id}", fields, content_type="application/json")


def _repeat(client: Client, task: Task, rule: str = "FREQ=WEEKLY") -> None:
    response = _patch(client, task.pk, dates={"due_date": "2026-10-15"}, repeat_rule=rule)
    assert response.status_code == 200


def _drag(client: Client, task: Task, day: str) -> None:
    response = _patch(client, task.pk, dates={"due_date": day}, move_occurrence=True)
    assert response.status_code == 200


def _noon(day: str) -> datetime:
    return datetime.fromisoformat(f"{day}T11:00:00+00:00")


def _close(client: Client, task: Task, status: str = "completed") -> str:
    response = _patch(client, task.pk, status=status)
    assert response.status_code == 200
    due: str = response.json()["task"]["due_date"]
    return due


def _reopen(client: Client, task: Task) -> str:
    return _close(client, task, "open")


def _calendar(client: Client) -> tuple[list[str], list[str]]:
    """Return the days the Task shows on and its later Occurrences, over four weeks."""
    response = client.get("/api/v1/tasks/calendar?start=2026-10-12&end=2026-11-08")
    body = response.json()
    shown = [item["due_date"] for item in body["items"]]
    return shown, [row["date"] for row in body["occurrences"]]


@pytest.mark.django_db
def test_closing_an_occurrence_moved_earlier_goes_to_the_series_date_after_it(
    client: Client,
    task: Task,
    freeze: Callable[[datetime], None],
) -> None:
    _repeat(client, task)
    _drag(client, task, "2026-10-14")
    freeze(_noon("2026-10-14"))

    assert _close(client, task) == "2026-10-22"


@pytest.mark.django_db
def test_the_calendar_does_not_show_the_series_date_an_occurrence_moved_from(
    client: Client,
    task: Task,
) -> None:
    _repeat(client, task)
    _drag(client, task, "2026-10-14")

    assert _calendar(client) == (["2026-10-14"], ["2026-10-22", "2026-10-29", "2026-11-05"])


@pytest.mark.django_db
def test_an_occurrence_moved_past_the_next_series_date_skips_nothing(
    client: Client,
    task: Task,
    freeze: Callable[[datetime], None],
) -> None:
    _repeat(client, task)
    _drag(client, task, "2026-10-23")

    calendar = _calendar(client)
    freeze(_noon("2026-10-23"))

    assert calendar == (["2026-10-23"], ["2026-10-22", "2026-10-29", "2026-11-05"])
    assert _close(client, task) == "2026-10-29"


@pytest.mark.django_db
def test_an_occurrence_moved_past_the_range_still_shows_the_series_dates_in_it(
    client: Client,
    task: Task,
) -> None:
    _repeat(client, task)
    _drag(client, task, "2026-11-13")

    assert _calendar(client) == ([], ["2026-10-22", "2026-10-29", "2026-11-05"])


@pytest.mark.django_db
def test_a_second_move_still_counts_from_the_original_series_date(
    client: Client,
    task: Task,
    freeze: Callable[[datetime], None],
) -> None:
    _repeat(client, task)
    _drag(client, task, "2026-10-14")
    _drag(client, task, "2026-10-13")

    calendar = _calendar(client)
    freeze(_noon("2026-10-13"))

    assert calendar[1] == ["2026-10-22", "2026-10-29", "2026-11-05"]
    assert _close(client, task) == "2026-10-22"


@pytest.mark.django_db
@pytest.mark.parametrize("rule", ["FREQ=WEEKLY;COUNT=3", "FREQ=WEEKLY;UNTIL=20261029"])
def test_a_series_with_an_end_still_ends_on_its_last_date(
    client: Client,
    task: Task,
    rule: str,
) -> None:
    _repeat(client, task, rule)
    _drag(client, task, "2026-10-14")

    assert _calendar(client)[1] == ["2026-10-22", "2026-10-29"]


@pytest.mark.django_db
def test_a_date_edit_restarts_the_series_at_the_new_due_date(
    client: Client,
    task: Task,
    freeze: Callable[[datetime], None],
) -> None:
    _repeat(client, task)
    _drag(client, task, "2026-10-14")

    response = _patch(client, task.pk, dates={"due_date": "2026-10-13"})

    assert response.status_code == 200
    assert _calendar(client)[1] == ["2026-10-20", "2026-10-27", "2026-11-03"]
    freeze(_noon("2026-10-13"))
    assert _close(client, task) == "2026-10-20"


@pytest.mark.django_db
def test_a_new_rule_restarts_the_series_at_the_moved_due_date(client: Client, task: Task) -> None:
    _repeat(client, task)
    _drag(client, task, "2026-10-14")

    response = _patch(client, task.pk, repeat_rule="FREQ=WEEKLY;INTERVAL=2")

    assert response.status_code == 200
    assert _calendar(client)[1] == ["2026-10-28"]


@pytest.mark.django_db
def test_the_next_occurrence_counts_from_its_own_series_date(
    client: Client,
    task: Task,
    freeze: Callable[[datetime], None],
) -> None:
    _repeat(client, task)
    _drag(client, task, "2026-10-14")
    freeze(_noon("2026-10-14"))
    _close(client, task)

    _drag(client, task, "2026-10-21")
    freeze(_noon("2026-10-21"))

    assert _close(client, task) == "2026-10-29"


@pytest.mark.django_db
def test_undo_puts_a_moved_occurrence_back_where_it_was_moved(
    client: Client,
    task: Task,
    freeze: Callable[[datetime], None],
) -> None:
    _repeat(client, task)
    _drag(client, task, "2026-10-14")
    freeze(_noon("2026-10-14"))
    _close(client, task)

    assert _reopen(client, task) == "2026-10-14"
    assert _calendar(client) == (["2026-10-14"], ["2026-10-22", "2026-10-29", "2026-11-05"])
    assert _close(client, task) == "2026-10-22"


@pytest.mark.django_db
def test_undo_works_from_an_advance_logged_before_moves_were_remembered(
    client: Client,
    task: Task,
    freeze: Callable[[datetime], None],
) -> None:
    _repeat(client, task)
    freeze(_noon("2026-10-15"))
    _close(client, task)
    advance = task.activity.get(kind=TaskActivity.Kind.REPEAT_ADVANCED)
    del advance.data["undo"]["occurrence_date"]
    advance.save(update_fields=["data"])

    assert _reopen(client, task) == "2026-10-15"
    assert _close(client, task) == "2026-10-22"


@pytest.mark.django_db
def test_another_users_occurrence_cannot_be_moved(client: Client, grace: User) -> None:
    theirs = creation.create_task(services.inbox(grace), "Grace's")

    response = _patch(client, theirs.pk, dates={"due_date": "2026-10-14"}, move_occurrence=True)

    assert response.status_code == 404
