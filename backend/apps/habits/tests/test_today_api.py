"""Tests for the Today strip's Habits: what's due today, or still due this week."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING

import pytest
from django.test import Client

from apps.accounts import services as accounts

if TYPE_CHECKING:
    from collections.abc import Callable

    from apps.accounts.models import User

# A Thursday; its week runs from Monday 9 to Sunday 15 March.
NOW = datetime(2026, 3, 12, 12, 0, tzinfo=UTC)


@pytest.fixture(autouse=True)
def _frozen(freeze_time: Callable[[datetime], None]) -> None:
    freeze_time(NOW)


def _create(client: Client, name: str, **settings: object) -> int:
    data = {"name": name, "icon": "book-open", "color": "teal", "start_date": "2026-03-01"}
    response = client.post("/api/v1/habits", {**data, **settings}, content_type="application/json")
    assert response.status_code == 201
    habit_id: int = response.json()["id"]
    return habit_id


def _check_in(client: Client, habit_id: int, day: str, count: int = 1) -> None:
    response = client.put(
        f"/api/v1/habits/{habit_id}/check-ins/{day}",
        {"count": count},
        content_type="application/json",
    )
    assert response.status_code == 200


def _strip(client: Client) -> list[str]:
    response = client.get("/api/v1/habits/today")
    assert response.status_code == 200
    return [habit["name"] for habit in response.json()]


@pytest.mark.django_db
def test_the_strip_requires_a_session() -> None:
    assert Client().get("/api/v1/habits/today").status_code == 401


@pytest.mark.django_db
def test_the_strip_shows_daily_habits_in_order_with_todays_check_ins(client: Client) -> None:
    read = _create(client, "Read", goal=2)
    _create(client, "Run")
    _check_in(client, read, "2026-03-12")

    strip = client.get("/api/v1/habits/today").json()

    assert [(habit["name"], habit["today_count"]) for habit in strip] == [("Read", 1), ("Run", 0)]


@pytest.mark.django_db
def test_the_strip_keeps_a_habit_done_today(client: Client) -> None:
    _check_in(client, _create(client, "Read"), "2026-03-12")

    assert _strip(client) == ["Read"]


@pytest.mark.django_db
def test_the_strip_shows_weekday_habits_only_on_their_days(client: Client) -> None:
    _create(client, "Gym", frequency="weekdays", weekdays=[1, 4])
    _create(client, "Swim", frequency="weekdays", weekdays=[2, 3, 5])

    assert _strip(client) == ["Gym"]


@pytest.mark.django_db
def test_the_strip_leaves_out_archived_habits_and_ones_not_started(client: Client) -> None:
    _create(client, "Read")
    archived = _create(client, "Run")
    client.post(f"/api/v1/habits/{archived}/archive")
    _create(client, "Meditate", start_date="2026-03-13")

    assert _strip(client) == ["Read"]


@pytest.mark.django_db
def test_the_strip_shows_a_times_a_week_habit_until_its_week_is_met(client: Client) -> None:
    gym = _create(client, "Gym", frequency="times_per_week", times_per_week=2)
    _create(client, "Swim", frequency="times_per_week", times_per_week=2)
    yoga = _create(client, "Yoga", frequency="times_per_week", times_per_week=2, goal=2)
    _check_in(client, gym, "2026-03-09")
    _check_in(client, gym, "2026-03-10")
    # One day short of the Goal doesn't count toward the week.
    _check_in(client, yoga, "2026-03-09", 2)
    _check_in(client, yoga, "2026-03-10", 1)

    assert _strip(client) == ["Swim", "Yoga"]


@pytest.mark.django_db
def test_the_strip_keeps_a_times_a_week_habit_whose_week_is_met_today(client: Client) -> None:
    gym = _create(client, "Gym", frequency="times_per_week", times_per_week=2)
    _check_in(client, gym, "2026-03-11")
    _check_in(client, gym, "2026-03-12")

    assert _strip(client) == ["Gym"]


@pytest.mark.django_db
def test_last_weeks_check_ins_dont_meet_this_week(client: Client) -> None:
    gym = _create(client, "Gym", frequency="times_per_week", times_per_week=2)
    _check_in(client, gym, "2026-03-07")
    _check_in(client, gym, "2026-03-08")

    assert _strip(client) == ["Gym"]


@pytest.mark.django_db
def test_the_strip_follows_the_users_time_zone(
    client: Client, ada: User, freeze_time: Callable[[datetime], None]
) -> None:
    _create(client, "Gym", frequency="weekdays", weekdays=[4])
    accounts.set_time_zone(ada, "Pacific/Auckland")
    # Thursday 23:00 UTC is already Friday in Auckland.
    freeze_time(datetime(2026, 3, 12, 23, 0, tzinfo=UTC))

    assert _strip(client) == []


@pytest.mark.django_db
def test_the_strip_never_shows_another_users_habits(grace: User, client: Client) -> None:
    other = Client()
    other.force_login(grace)
    _create(other, "Grace's run")

    assert _strip(client) == []
