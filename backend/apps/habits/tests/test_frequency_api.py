"""Tests for a Habit's Frequency and start date, chosen when adding it, and editing a Habit."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING

import pytest
from django.test import Client

if TYPE_CHECKING:
    from collections.abc import Callable

    from django.test.client import _MonkeyPatchedWSGIResponse as Response

    from apps.accounts.models import User

NOW = datetime(2026, 3, 10, 12, 0, tzinfo=UTC)


def _create(client: Client, data: object) -> Response:
    return client.post("/api/v1/habits", data, content_type="application/json")


def _patch(client: Client, habit_id: int, data: object) -> Response:
    return client.patch(f"/api/v1/habits/{habit_id}", data, content_type="application/json")


def _habit(name: str = "Read") -> dict[str, str]:
    return {"name": name, "icon": "book-open", "color": "teal"}


def _names(client: Client) -> list[str]:
    return [habit["name"] for habit in client.get("/api/v1/habits").json()]


@pytest.mark.django_db
def test_editing_requires_a_session() -> None:
    response = Client().patch("/api/v1/habits/1", {}, content_type="application/json")

    assert response.status_code == 401


@pytest.mark.django_db
def test_create_adds_a_habit_done_on_chosen_weekdays(client: Client) -> None:
    created = _create(client, {**_habit(), "frequency": "weekdays", "weekdays": [5, 1, 3]})

    assert created.status_code == 201
    assert created.json()["frequency"] == "weekdays"
    assert created.json()["weekdays"] == [1, 3, 5]


@pytest.mark.django_db
def test_create_adds_a_habit_done_a_number_of_times_a_week(client: Client) -> None:
    created = _create(client, {**_habit(), "frequency": "times_per_week", "times_per_week": 3})

    assert created.status_code == 201
    assert created.json()["frequency"] == "times_per_week"
    assert created.json()["times_per_week"] == 3
    assert created.json()["weekdays"] == []


@pytest.mark.django_db
def test_a_daily_habit_has_no_weekdays_or_times_a_week(client: Client) -> None:
    created = _create(client, {**_habit(), "weekdays": [1], "times_per_week": 2})

    assert created.json()["frequency"] == "daily"
    assert created.json()["weekdays"] == []
    assert created.json()["times_per_week"] is None


@pytest.mark.django_db
@pytest.mark.parametrize(
    "frequency",
    [
        {"frequency": "weekdays"},
        {"frequency": "weekdays", "weekdays": []},
        {"frequency": "weekdays", "weekdays": [0]},
        {"frequency": "weekdays", "weekdays": [8]},
        {"frequency": "times_per_week"},
        {"frequency": "times_per_week", "times_per_week": 0},
        {"frequency": "times_per_week", "times_per_week": 7},
        {"frequency": "monthly"},
    ],
)
def test_create_refuses_a_frequency_that_makes_no_sense(
    client: Client,
    frequency: dict[str, object],
) -> None:
    response = _create(client, {**_habit(), **frequency})

    assert response.status_code == 422
    assert _names(client) == []


@pytest.mark.django_db
@pytest.mark.parametrize("times_per_week", [1, 6])
def test_create_accepts_one_to_six_times_a_week(client: Client, times_per_week: int) -> None:
    response = _create(
        client,
        {**_habit(), "frequency": "times_per_week", "times_per_week": times_per_week},
    )

    assert response.status_code == 201


@pytest.mark.django_db
def test_create_takes_a_chosen_start_date(client: Client) -> None:
    created = _create(client, {**_habit(), "start_date": "2026-01-05"})

    assert created.json()["start_date"] == "2026-01-05"


@pytest.mark.django_db
def test_edit_changes_every_setting_the_list_then_shows(client: Client) -> None:
    habit_id = _create(client, _habit()).json()["id"]

    edited = _patch(
        client,
        habit_id,
        {
            "name": " Run ",
            "icon": "footprints",
            "color": "orange",
            "frequency": "weekdays",
            "weekdays": [2, 4],
            "goal": 8,
            "start_date": "2026-02-01",
            "reminder_time": "08:30",
        },
    )

    assert edited.status_code == 200
    assert edited.json() == {
        "id": habit_id,
        "name": "Run",
        "icon": "footprints",
        "color": "orange",
        "frequency": "weekdays",
        "weekdays": [2, 4],
        "times_per_week": None,
        "goal": 8,
        "start_date": "2026-02-01",
        "reminder_time": "08:30:00",
        "today_count": 0,
        "is_archived": False,
    }
    assert client.get("/api/v1/habits").json() == [edited.json()]


@pytest.mark.django_db
def test_edit_leaves_settings_it_is_not_given(client: Client) -> None:
    created = _create(client, {**_habit(), "frequency": "weekdays", "weekdays": [1]}).json()

    edited = _patch(client, created["id"], {"name": "Study"})

    assert edited.json() == {**created, "name": "Study"}


@pytest.mark.django_db
def test_edit_switches_a_habit_to_a_number_of_times_a_week(client: Client) -> None:
    created = _create(client, {**_habit(), "frequency": "weekdays", "weekdays": [1]}).json()

    edited = _patch(
        client,
        created["id"],
        {"frequency": "times_per_week", "times_per_week": 4},
    )

    assert edited.json()["frequency"] == "times_per_week"
    assert edited.json()["times_per_week"] == 4
    assert edited.json()["weekdays"] == []


@pytest.mark.django_db
def test_edit_changes_the_weekdays_of_a_weekday_habit(client: Client) -> None:
    created = _create(client, {**_habit(), "frequency": "weekdays", "weekdays": [1]}).json()

    edited = _patch(client, created["id"], {"weekdays": [6, 7]})

    assert edited.json()["weekdays"] == [6, 7]


@pytest.mark.django_db
@pytest.mark.parametrize(
    "patch",
    [
        {"name": ""},
        {"name": "x" * 101},
        {"frequency": "weekdays"},
        {"frequency": "weekdays", "weekdays": []},
        {"frequency": "times_per_week"},
        {"frequency": "times_per_week", "times_per_week": 7},
        {"icon": "sparkles"},
        {"goal": 0},
        {"goal": 100},
    ],
)
def test_edit_refuses_a_setting_that_makes_no_sense(
    client: Client,
    patch: dict[str, object],
) -> None:
    created = _create(client, _habit()).json()

    response = _patch(client, created["id"], patch)

    assert response.status_code == 422
    assert client.get("/api/v1/habits").json() == [created]


@pytest.mark.django_db
def test_edit_cannot_reach_another_users_habit(client: Client, grace: User) -> None:
    other = Client()
    other.force_login(grace)
    created = _create(other, _habit("Grace's")).json()

    response = _patch(client, created["id"], {"name": "Mine now"})

    assert response.status_code == 404
    assert other.get("/api/v1/habits").json() == [created]


@pytest.mark.django_db
def test_a_lower_goal_lowers_check_ins_above_it(
    client: Client,
    freeze_time: Callable[[datetime], None],
) -> None:
    freeze_time(NOW)
    habit_id = _create(client, {**_habit(), "goal": 8}).json()["id"]
    client.put(
        f"/api/v1/habits/{habit_id}/check-ins/2026-03-10",
        {"count": 6},
        content_type="application/json",
    )

    edited = _patch(client, habit_id, {"goal": 4})

    assert edited.json()["goal"] == 4
    assert edited.json()["today_count"] == 4


@pytest.mark.django_db
def test_edit_keeps_todays_check_ins(
    client: Client,
    freeze_time: Callable[[datetime], None],
) -> None:
    freeze_time(NOW)
    habit_id = _create(client, {**_habit(), "goal": 3}).json()["id"]
    client.put(
        f"/api/v1/habits/{habit_id}/check-ins/2026-03-10",
        {"count": 2},
        content_type="application/json",
    )

    edited = _patch(client, habit_id, {"name": "Study"})

    assert edited.json()["today_count"] == 2
