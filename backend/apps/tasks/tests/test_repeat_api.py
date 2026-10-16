"""Tests for setting a Task's Repeat and removing it, through the Task endpoints."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING

import pytest
from django.test import Client

from apps.accounts.services import set_time_zone
from apps.tasks import creation, services

if TYPE_CHECKING:
    from collections.abc import Callable
    from typing import Any

    from django.test.client import _MonkeyPatchedWSGIResponse as Response

    from apps.accounts.models import User
    from apps.tasks.models import Task

# Thursday 15 October 2026, 12:00 in London.
NOW = datetime(2026, 10, 15, 11, 0, tzinfo=UTC)
TODAY = {"due_date": "2026-10-15"}


@pytest.fixture
def client(ada: User, freeze_time: Callable[[datetime], None]) -> Client:
    # Stop the clock before signing in, or the session would have expired by then.
    freeze_time(NOW)
    set_time_zone(ada, "Europe/London")
    client = Client()
    client.force_login(ada)
    return client


@pytest.fixture
def task(ada: User) -> Task:
    return creation.create_task(services.inbox(ada), "Water the plants")


def _patch(client: Client, task_id: int, **fields: Any) -> Response:  # noqa: ANN401 - JSON body
    return client.patch(f"/api/v1/tasks/{task_id}", fields, content_type="application/json")


def _events(client: Client, task_id: int, kind: str) -> list[dict[str, object]]:
    items = client.get(f"/api/v1/tasks/{task_id}/activity").json()["items"]
    return [item["data"] for item in items if item["kind"] == kind]


@pytest.mark.django_db
def test_a_dated_task_repeats_on_the_calendar_by_default(client: Client, task: Task) -> None:
    response = _patch(client, task.pk, dates=TODAY, repeat_rule="FREQ=WEEKLY;BYDAY=TH")

    assert response.status_code == 200
    body = response.json()["task"]
    assert (body["repeat_rule"], body["repeat_from"]) == ("FREQ=WEEKLY;BYDAY=TH", "calendar")
    assert _events(client, task.pk, "repeat_changed") == [
        {"old": None, "new": {"rule": "FREQ=WEEKLY;BYDAY=TH", "repeat_from": "calendar"}},
    ]


@pytest.mark.django_db
def test_changing_where_a_repeat_counts_from_is_logged(client: Client, task: Task) -> None:
    _patch(client, task.pk, dates=TODAY, repeat_rule="FREQ=DAILY")

    response = _patch(client, task.pk, repeat_from="completion")

    assert response.json()["task"]["repeat_from"] == "completion"
    assert _events(client, task.pk, "repeat_changed")[0] == {
        "old": {"rule": "FREQ=DAILY", "repeat_from": "calendar"},
        "new": {"rule": "FREQ=DAILY", "repeat_from": "completion"},
    }


@pytest.mark.django_db
def test_an_rrule_prefix_is_dropped(client: Client, task: Task) -> None:
    response = _patch(client, task.pk, dates=TODAY, repeat_rule="RRULE:FREQ=MONTHLY;BYMONTHDAY=-1")

    assert response.json()["task"]["repeat_rule"] == "FREQ=MONTHLY;BYMONTHDAY=-1"


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("rule", "detail"),
    [
        ("every monday", "That isn't a repeat rule Nudge understands."),
        ("FREQ=WEEKLY;BYDAY=XX", "That isn't a repeat rule Nudge understands."),
        ("FREQ=DAILY;UNTIL=20261231T000000Z", "That isn't a repeat rule Nudge understands."),
        ("FREQ=DAILY\nEXDATE:20261016", "That isn't a repeat rule Nudge understands."),
        ("EXDATE:20261016", "That isn't a repeat rule Nudge understands."),
        ("DTSTART:20200101T000000", "That isn't a repeat rule Nudge understands."),
        ("FREQ=HOURLY", "A task repeats at most daily."),
    ],
)
def test_a_rule_dateutil_cannot_read_is_refused(
    client: Client,
    task: Task,
    rule: str,
    detail: str,
) -> None:
    response = _patch(client, task.pk, dates=TODAY, repeat_rule=rule)

    assert response.status_code == 422
    assert response.json() == {"detail": detail}


@pytest.mark.django_db
def test_an_undated_task_cannot_repeat(client: Client, task: Task) -> None:
    response = _patch(client, task.pk, repeat_rule="FREQ=DAILY")

    assert response.status_code == 422
    assert response.json() == {"detail": "A repeating task needs a due date."}


@pytest.mark.django_db
def test_a_subtask_cannot_repeat(client: Client, task: Task) -> None:
    subtask = creation.create_subtask(task, "Fill the can").task

    response = _patch(client, subtask.pk, dates=TODAY, repeat_rule="FREQ=DAILY")

    assert response.status_code == 422
    assert response.json() == {"detail": "Only a top-level task can repeat."}


@pytest.mark.django_db
def test_an_empty_rule_stops_the_repeat(client: Client, task: Task) -> None:
    _patch(client, task.pk, dates=TODAY, repeat_rule="FREQ=DAILY")

    response = _patch(client, task.pk, repeat_rule="")

    assert response.json()["task"]["repeat_rule"] == ""
    assert _events(client, task.pk, "repeat_changed")[0]["new"] is None


@pytest.mark.django_db
def test_clearing_the_due_date_removes_the_repeat(client: Client, task: Task) -> None:
    _patch(client, task.pk, dates=TODAY, repeat_rule="FREQ=DAILY", repeat_from="due")

    response = _patch(client, task.pk, dates=None)

    assert response.json()["task"]["repeat_rule"] == ""
    assert _events(client, task.pk, "repeat_removed") == [
        {"rule": "FREQ=DAILY", "repeat_from": "due"},
    ]


@pytest.mark.django_db
def test_undo_puts_back_a_repeat_removed_with_the_due_date(client: Client, task: Task) -> None:
    _patch(client, task.pk, dates=TODAY, repeat_rule="FREQ=DAILY", repeat_from="due")
    _patch(client, task.pk, dates=None)

    response = _patch(client, task.pk, dates=TODAY, repeat_rule="FREQ=DAILY", repeat_from="due")

    body = response.json()["task"]
    assert (body["repeat_rule"], body["repeat_from"]) == ("FREQ=DAILY", "due")


@pytest.mark.django_db
def test_becoming_a_subtask_removes_the_repeat(client: Client, ada: User, task: Task) -> None:
    _patch(client, task.pk, dates=TODAY, repeat_rule="FREQ=DAILY")
    parent = creation.create_task(services.inbox(ada), "Garden")

    response = client.post(
        f"/api/v1/tasks/{task.pk}/move",
        {"parent_id": parent.pk},
        content_type="application/json",
    )

    assert response.json()["task"]["repeat_rule"] == ""
    assert _events(client, task.pk, "repeat_removed") == [
        {"rule": "FREQ=DAILY", "repeat_from": "calendar"},
    ]


@pytest.mark.django_db
def test_a_repeating_task_shows_once_in_upcoming(client: Client, task: Task) -> None:
    _patch(client, task.pk, dates={"due_date": "2026-10-16"}, repeat_rule="FREQ=DAILY")

    items = client.get("/api/v1/tasks?view=upcoming").json()["items"]

    assert [(item["title"], item["due_date"]) for item in items] == [
        ("Water the plants", "2026-10-16"),
    ]


@pytest.mark.django_db
def test_moving_a_repeating_task_to_another_time_keeps_its_repeat(
    client: Client,
    task: Task,
) -> None:
    _patch(client, task.pk, dates={**TODAY, "due_time": "09:00"}, repeat_rule="FREQ=WEEKLY")

    # A Week or Day drag sends only the dates, so only the current Occurrence moves.
    response = _patch(client, task.pk, dates={"due_date": "2026-10-16", "due_time": "14:15"})

    body = response.json()["task"]
    assert (body["due_date"], body["due_time"]) == ("2026-10-16", "14:15:00")
    assert body["repeat_rule"] == "FREQ=WEEKLY"
