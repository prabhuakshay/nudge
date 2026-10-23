"""Tests for setting a Habit's reminder time through the API."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING

import pytest

from apps.accounts.services import set_time_zone
from apps.notifications.models import Notification
from apps.tasks import tasks as jobs

if TYPE_CHECKING:
    from collections.abc import Callable

    from django.test import Client

    from apps.accounts.models import User

NOW = datetime(2026, 3, 10, 8, 0, tzinfo=UTC)
HABIT = {"name": "Read", "icon": "book-open", "color": "teal"}


def _create(client: Client, data: object) -> dict[str, object]:
    response = client.post("/api/v1/habits", data, content_type="application/json")
    assert response.status_code == 201
    body: dict[str, object] = response.json()
    return body


def _patch(client: Client, habit_id: object, data: object) -> dict[str, object]:
    response = client.patch(f"/api/v1/habits/{habit_id}", data, content_type="application/json")
    assert response.status_code == 200
    body: dict[str, object] = response.json()
    return body


@pytest.mark.django_db
def test_a_new_habit_has_no_reminder_unless_given_a_time(client: Client) -> None:
    assert _create(client, HABIT)["reminder_time"] is None
    assert _create(client, {**HABIT, "reminder_time": "21:30"})["reminder_time"] == "21:30:00"


@pytest.mark.django_db
def test_editing_sets_keeps_and_removes_the_reminder_time(client: Client) -> None:
    habit = _create(client, HABIT)

    set_time = _patch(client, habit["id"], {"reminder_time": "07:15"})
    kept = _patch(client, habit["id"], {"name": "Read a book"})
    removed = _patch(client, habit["id"], {"reminder_time": None})

    assert (set_time["reminder_time"], kept["reminder_time"]) == ("07:15:00", "07:15:00")
    assert removed["reminder_time"] is None


@pytest.mark.django_db
def test_a_reminder_time_set_through_the_api_fires(
    ada: User,
    client: Client,
    freeze_time: Callable[[datetime], None],
) -> None:
    set_time_zone(ada, "Europe/London")
    freeze_time(NOW)
    _create(client, {**HABIT, "reminder_time": "09:00"})
    freeze_time(datetime(2026, 3, 10, 9, 0, tzinfo=UTC))

    jobs.send_due_reminders(timestamp=0)

    assert Notification.objects.filter(user=ada, title="Read").exists()
