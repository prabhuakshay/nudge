"""Tests for closing a repeating Task, which moves it on to its next Occurrence, and Undo."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING

import pytest
from django.test import Client

from apps.accounts.services import set_time_zone
from apps.tasks import services

if TYPE_CHECKING:
    from collections.abc import Callable
    from typing import Any

    from django.test.client import _MonkeyPatchedWSGIResponse as Response

    from apps.accounts.models import User
    from apps.tasks.models import Task

# Thursday 15 October 2026, 12:00 in London.
NOW = datetime(2026, 10, 15, 11, 0, tzinfo=UTC)


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
    return services.create_task(services.inbox(ada), "Water the plants")


def _patch(client: Client, task_id: int, **fields: Any) -> Response:  # noqa: ANN401 - JSON body
    return client.patch(f"/api/v1/tasks/{task_id}", fields, content_type="application/json")


def _repeat(client: Client, task: Task, rule: str, due: str, **fields: Any) -> None:  # noqa: ANN401 - JSON body
    response = _patch(client, task.pk, dates={"due_date": due}, repeat_rule=rule, **fields)
    assert response.status_code == 200


def _complete(client: Client, task_id: int, status: str = "completed") -> dict[str, Any]:
    response = _patch(client, task_id, status=status)
    assert response.status_code == 200
    body: dict[str, Any] = response.json()
    return body


def _events(client: Client, task_id: int, kind: str) -> list[dict[str, object]]:
    items = client.get(f"/api/v1/tasks/{task_id}/activity").json()["items"]
    return [item["data"] for item in items if item["kind"] == kind]


@pytest.mark.django_db
def test_completing_moves_the_same_task_to_its_next_occurrence(client: Client, task: Task) -> None:
    _repeat(client, task, "FREQ=DAILY", "2026-10-15")

    body = _complete(client, task.pk)

    assert (body["task"]["status"], body["task"]["due_date"]) == ("open", "2026-10-16")
    assert body["affected"] == [{"id": task.pk, "prior_status": "open", "prior_blocked_reason": ""}]
    assert _events(client, task.pk, "repeat_advanced") == [
        {"action": "completed", "occurrence": "2026-10-15", "next": "2026-10-16"},
    ]


@pytest.mark.django_db
def test_wont_do_skips_an_occurrence(client: Client, task: Task) -> None:
    _repeat(client, task, "FREQ=WEEKLY", "2026-10-15")

    body = _complete(client, task.pk, "wont_do")

    assert body["task"]["due_date"] == "2026-10-22"
    assert _events(client, task.pk, "repeat_advanced")[0]["action"] == "skipped"


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("repeat_from", "rule", "next_due"),
    [
        ("calendar", "FREQ=DAILY", "2026-10-16"),
        ("due", "FREQ=DAILY", "2026-10-13"),
        ("completion", "FREQ=DAILY;INTERVAL=3", "2026-10-18"),
    ],
)
def test_where_the_next_occurrence_counts_from(
    client: Client,
    task: Task,
    repeat_from: str,
    rule: str,
    next_due: str,
) -> None:
    _repeat(client, task, rule, "2026-10-12", repeat_from=repeat_from)

    body = _complete(client, task.pk)

    assert body["task"]["due_date"] == next_due


@pytest.mark.django_db
def test_monthly_on_the_last_day_lands_on_each_month_end(
    client: Client,
    ada: User,
    task: Task,
    freeze: Callable[[datetime], None],
) -> None:
    freeze(datetime(2027, 1, 31, 12, 0, tzinfo=UTC))
    # The session from the fixture's clock has expired by then.
    client.force_login(ada)
    _repeat(client, task, "FREQ=MONTHLY;BYMONTHDAY=-1", "2027-01-31", repeat_from="due")

    first = _complete(client, task.pk)["task"]["due_date"]
    freeze(datetime(2027, 2, 28, 12, 0, tzinfo=UTC))
    client.force_login(ada)
    second = _complete(client, task.pk)["task"]["due_date"]

    assert (first, second) == ("2027-02-28", "2027-03-31")


@pytest.mark.django_db
def test_a_timed_reminder_keeps_its_clock_time_across_daylight_saving(
    client: Client,
    task: Task,
    freeze: Callable[[datetime], None],
) -> None:
    # London leaves summer time on Sunday 25 October 2026.
    freeze(datetime(2026, 10, 24, 7, 0, tzinfo=UTC))
    _patch(
        client,
        task.pk,
        dates={"due_date": "2026-10-24", "due_time": "09:00"},
        repeat_rule="FREQ=DAILY",
        reminders=[0],
    )

    body = _complete(client, task.pk)["task"]

    assert (body["due_date"], body["due_time"]) == ("2026-10-25", "09:00:00")
    assert body["reminders"] == [{"offset": 0, "fire_at": "2026-10-25T09:00:00Z"}]


@pytest.mark.django_db
def test_a_range_moves_whole(client: Client, task: Task) -> None:
    _patch(
        client,
        task.pk,
        dates={"start_date": "2026-10-14", "due_date": "2026-10-15"},
        repeat_rule="FREQ=WEEKLY",
    )

    body = _complete(client, task.pk)["task"]

    assert (body["start_date"], body["due_date"]) == ("2026-10-21", "2026-10-22")


@pytest.mark.django_db
def test_subtasks_start_over_and_dated_ones_move_with_it(client: Client, task: Task) -> None:
    _repeat(client, task, "FREQ=WEEKLY", "2026-10-15")
    done = services.create_subtask(task, "Fill the can").task
    dated = services.create_subtask(task, "Feed the roses").task
    _patch(client, done.pk, status="completed")
    _patch(client, dated.pk, dates={"due_date": "2026-10-14"}, status="wont_do")

    subtasks = _complete(client, task.pk)["task"]["subtasks"]

    assert [(row["status"], row["due_date"]) for row in subtasks] == [
        ("open", None),
        ("open", "2026-10-21"),
    ]


@pytest.mark.django_db
def test_the_series_closes_for_real_after_its_until(client: Client, task: Task) -> None:
    _repeat(client, task, "FREQ=DAILY;UNTIL=20261015", "2026-10-15")

    body = _complete(client, task.pk)["task"]

    assert (body["status"], body["due_date"]) == ("completed", "2026-10-15")


@pytest.mark.django_db
def test_a_count_from_completion_runs_out(
    client: Client,
    task: Task,
    freeze: Callable[[datetime], None],
) -> None:
    _repeat(client, task, "FREQ=DAILY;COUNT=2", "2026-10-15", repeat_from="completion")

    first = _complete(client, task.pk)["task"]
    freeze(datetime(2026, 10, 16, 11, 0, tzinfo=UTC))
    second = _complete(client, task.pk)["task"]

    assert (first["status"], first["repeat_rule"]) == ("open", "FREQ=DAILY;COUNT=1")
    assert (second["status"], second["due_date"]) == ("completed", "2026-10-16")


@pytest.mark.django_db
def test_a_future_occurrence_cannot_be_completed_early(client: Client, task: Task) -> None:
    _repeat(client, task, "FREQ=DAILY", "2026-10-16")

    response = _patch(client, task.pk, status="completed")

    assert response.status_code == 422
    assert response.json() == {"detail": "This repeating task isn't due yet."}


@pytest.mark.django_db
def test_undo_reopens_on_the_same_occurrence(client: Client, task: Task) -> None:
    _repeat(client, task, "FREQ=WEEKLY", "2026-10-15")
    done = services.create_subtask(task, "Fill the can").task
    _patch(client, done.pk, dates={"due_date": "2026-10-14"}, status="completed")
    _complete(client, task.pk)

    body = _complete(client, task.pk, "open")["task"]

    assert (body["status"], body["due_date"]) == ("open", "2026-10-15")
    assert [(row["status"], row["due_date"]) for row in body["subtasks"]] == [
        ("completed", "2026-10-14"),
    ]


@pytest.mark.django_db
def test_undo_restores_a_blocked_reason(client: Client, task: Task) -> None:
    _repeat(client, task, "FREQ=DAILY;COUNT=5", "2026-10-15", repeat_from="completion")
    _patch(client, task.pk, status="blocked", blocked_reason="No water")
    _complete(client, task.pk)

    body = _complete(client, task.pk, "blocked")["task"]

    assert (body["status"], body["blocked_reason"]) == ("blocked", "No water")
    assert (body["due_date"], body["repeat_rule"]) == ("2026-10-15", "FREQ=DAILY;COUNT=5")


@pytest.mark.django_db
def test_reopening_after_a_later_change_does_not_undo(client: Client, task: Task) -> None:
    _repeat(client, task, "FREQ=DAILY", "2026-10-15")
    _complete(client, task.pk)
    _patch(client, task.pk, dates={"due_date": "2026-10-20"})

    body = _complete(client, task.pk, "open")["task"]

    assert body["due_date"] == "2026-10-20"
