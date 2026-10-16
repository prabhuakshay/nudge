"""Tests for setting a Task's Reminders through the Task endpoints."""

from __future__ import annotations

from datetime import UTC, date, datetime
from typing import TYPE_CHECKING

import pytest
from django.test import Client

from apps.accounts.services import set_time_zone
from apps.tasks import creation, services
from apps.tasks.dates import TaskDates
from apps.tasks.models import Reminder

if TYPE_CHECKING:
    from collections.abc import Callable
    from typing import Any

    from django.test.client import _MonkeyPatchedWSGIResponse as Response

    from apps.accounts.models import User
    from apps.tasks.models import Task

NOW = datetime(2026, 11, 6, 13, 0, tzinfo=UTC)
AT_TWO = {"due_date": "2026-11-06", "due_time": "14:00"}


@pytest.fixture
def client(ada: User, freeze_time: Callable[[datetime], None]) -> Client:
    # Stop the clock before signing in, or the session would have expired by then.
    freeze_time(NOW)
    client = Client()
    client.force_login(ada)
    return client


@pytest.fixture
def task(ada: User) -> Task:
    set_time_zone(ada, "Europe/London")
    return creation.create_task(services.inbox(ada), "Call the bank")


def _patch(client: Client, task_id: int, **fields: Any) -> Response:  # noqa: ANN401 - JSON body
    return client.patch(f"/api/v1/tasks/{task_id}", fields, content_type="application/json")


@pytest.mark.django_db
def test_a_task_gets_reminders_with_their_fire_times(client: Client, task: Task) -> None:
    _patch(client, task.pk, dates=AT_TWO)

    response = _patch(client, task.pk, reminders=[0, -30])

    assert response.status_code == 200
    assert response.json()["task"]["reminders"] == [
        {"offset": -30, "fire_at": "2026-11-06T13:30:00Z"},
        {"offset": 0, "fire_at": "2026-11-06T14:00:00Z"},
    ]


@pytest.mark.django_db
def test_the_drawer_shows_the_reminders(client: Client, task: Task) -> None:
    _patch(client, task.pk, dates=AT_TWO, reminders=[-5])

    body = client.get(f"/api/v1/tasks/{task.pk}").json()

    assert body["reminders"] == [{"offset": -5, "fire_at": "2026-11-06T13:55:00Z"}]


@pytest.mark.django_db
def test_an_undated_task_cannot_get_reminders(client: Client, task: Task) -> None:
    response = _patch(client, task.pk, reminders=[-30])

    assert response.status_code == 422
    assert response.json() == {"detail": "A reminder needs a due date."}


@pytest.mark.django_db
def test_more_than_ten_reminders_are_refused(client: Client, task: Task) -> None:
    _patch(client, task.pk, dates=AT_TWO)

    response = _patch(client, task.pk, reminders=list(range(-11, 0)))

    assert response.status_code == 422
    assert not Reminder.objects.exists()


@pytest.mark.django_db
def test_a_reminder_more_than_a_year_away_is_refused(client: Client, task: Task) -> None:
    _patch(client, task.pk, dates=AT_TWO)

    response = _patch(client, task.pk, reminders=[-366 * 24 * 60])

    assert response.status_code == 422


@pytest.mark.django_db
def test_clearing_the_due_date_removes_the_reminders_and_undo_brings_them_back(
    client: Client,
    task: Task,
) -> None:
    _patch(client, task.pk, dates=AT_TWO, reminders=[-30])

    cleared = _patch(client, task.pk, dates=None).json()["task"]["reminders"]
    restored = _patch(client, task.pk, dates=AT_TWO, reminders=[-30]).json()["task"]["reminders"]

    assert cleared == []
    assert restored == [{"offset": -30, "fire_at": "2026-11-06T13:30:00Z"}]


@pytest.mark.django_db
def test_reminder_changes_are_logged_in_activity(client: Client, task: Task) -> None:
    _patch(client, task.pk, dates=AT_TWO, reminders=[-30])
    _patch(client, task.pk, dates=None)

    items = client.get(f"/api/v1/tasks/{task.pk}/activity").json()["items"]

    changes = [item["data"] for item in items if item["kind"] == "reminders_changed"]
    assert changes == [
        {"old": [-30], "new": [], "all_day": False},
        {"old": [], "new": [-30], "all_day": False},
    ]


@pytest.mark.django_db
def test_setting_the_same_reminders_again_logs_nothing(client: Client, task: Task) -> None:
    _patch(client, task.pk, dates=AT_TWO, reminders=[-30, 0])

    _patch(client, task.pk, reminders=[0, -30])

    assert task.activity.filter(kind="reminders_changed").count() == 1


@pytest.mark.django_db
def test_reminders_cannot_be_set_on_another_users_task(
    client: Client,
    grace: User,
) -> None:
    theirs = creation.create_task(services.inbox(grace), "Grace's task")
    dates = TaskDates(due_date=date(2026, 11, 6))
    services.update_task(grace, theirs.pk, services.TaskEdit(dates=dates))

    response = _patch(client, theirs.pk, reminders=[-30])

    assert response.status_code == 404
    assert not Reminder.objects.exists()
