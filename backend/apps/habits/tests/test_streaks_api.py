"""Tests for a Habit's current and best Streak, as the API's Habit output shows them."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from typing import TYPE_CHECKING

import pytest

from apps.accounts.services import set_time_zone

if TYPE_CHECKING:
    from collections.abc import Callable, Iterable

    from django.test import Client

    from apps.accounts.models import User

# A Wednesday.
NOW = datetime(2026, 3, 11, 12, 0, tzinfo=UTC)
TODAY = date(2026, 3, 11)


@pytest.fixture(autouse=True)
def _now(freeze_time: Callable[[datetime], None]) -> None:
    freeze_time(NOW)


def _create(client: Client, **fields: object) -> int:
    data = {"name": "Read", "icon": "book-open", "color": "teal", "start_date": "2026-01-01"}
    response = client.post("/api/v1/habits", {**data, **fields}, content_type="application/json")
    assert response.status_code == 201, response.json()
    habit_id: int = response.json()["id"]
    return habit_id


def _check_in(client: Client, habit_id: int, days: Iterable[date], count: int = 1) -> None:
    for day in days:
        response = client.put(
            f"/api/v1/habits/{habit_id}/check-ins/{day.isoformat()}",
            {"count": count},
            content_type="application/json",
        )
        assert response.status_code == 200, response.json()


def _days_back(first: int, last: int) -> list[date]:
    """The days from `first` days ago to `last` days ago."""
    return [TODAY - timedelta(days=back) for back in range(first, last + 1)]


def _streaks(client: Client, habit_id: int) -> tuple[int, int, str]:
    found = next(habit for habit in client.get("/api/v1/habits").json() if habit["id"] == habit_id)
    return found["current_streak"], found["best_streak"], found["streak_unit"]


@pytest.mark.django_db
def test_a_missed_day_ends_a_daily_streak(client: Client) -> None:
    habit_id = _create(client)
    _check_in(client, habit_id, [TODAY, *_days_back(1, 2), *_days_back(4, 8)])

    assert _streaks(client, habit_id) == (3, 5, "days")


@pytest.mark.django_db
def test_a_weekday_streak_skips_the_days_it_isnt_asked_for(client: Client) -> None:
    habit_id = _create(client, frequency="weekdays", weekdays=[1, 3, 5])
    # Wednesday, Monday, last Friday and last Wednesday.
    _check_in(client, habit_id, [TODAY, *_days_back(2, 2), *_days_back(5, 5), *_days_back(7, 7)])

    assert _streaks(client, habit_id) == (4, 4, "days")


@pytest.mark.django_db
def test_today_doesnt_break_a_streak_before_its_over(client: Client) -> None:
    habit_id = _create(client)
    _check_in(client, habit_id, _days_back(1, 3))

    assert _streaks(client, habit_id) == (3, 3, "days")


@pytest.mark.django_db
def test_a_day_below_the_goal_doesnt_count(client: Client) -> None:
    habit_id = _create(client, goal=2)
    _check_in(client, habit_id, _days_back(1, 2), count=2)
    _check_in(client, habit_id, _days_back(3, 3), count=1)
    _check_in(client, habit_id, _days_back(4, 6), count=2)

    assert _streaks(client, habit_id) == (2, 3, "days")


@pytest.mark.django_db
def test_a_times_a_week_streak_counts_monday_to_sunday_weeks_that_met_the_number(
    client: Client,
) -> None:
    habit_id = _create(client, frequency="times_per_week", times_per_week=2)
    # Sunday the 1st and Monday the 2nd are days in a row but in different weeks, and the week
    # of the 16th has only Sunday the 22nd.
    _check_in(
        client,
        habit_id,
        [TODAY, *_days_back(3, 3), *_days_back(9, 11), *_days_back(17, 17)],
    )

    assert _streaks(client, habit_id) == (2, 2, "weeks")

    _check_in(client, habit_id, _days_back(1, 1))

    assert _streaks(client, habit_id) == (3, 3, "weeks")


@pytest.mark.django_db
def test_days_before_the_start_date_dont_count(client: Client) -> None:
    habit_id = _create(client)
    _check_in(client, habit_id, _days_back(1, 6))

    client.patch(
        f"/api/v1/habits/{habit_id}",
        {"start_date": (TODAY - timedelta(days=3)).isoformat()},
        content_type="application/json",
    )

    assert _streaks(client, habit_id) == (3, 3, "days")


@pytest.mark.django_db
def test_changing_the_frequency_recomputes_the_streaks(client: Client) -> None:
    habit_id = _create(client)
    # Monday, last Friday, last Wednesday and last Monday.
    _check_in(client, habit_id, [*_days_back(2, 2), *_days_back(5, 5), *_days_back(7, 7)])
    _check_in(client, habit_id, _days_back(9, 9))

    assert _streaks(client, habit_id) == (0, 1, "days")

    client.patch(
        f"/api/v1/habits/{habit_id}",
        {"frequency": "weekdays", "weekdays": [1, 3, 5]},
        content_type="application/json",
    )

    assert _streaks(client, habit_id) == (4, 4, "days")


@pytest.mark.django_db
def test_streaks_follow_the_users_day_past_midnight(client: Client, ada: User) -> None:
    # Already Thursday the 12th in Auckland, 13 hours ahead.
    set_time_zone(ada, "Pacific/Auckland")
    habit_id = _create(client)
    _check_in(client, habit_id, [TODAY + timedelta(days=1), TODAY, *_days_back(1, 1)])

    assert _streaks(client, habit_id) == (3, 3, "days")


@pytest.mark.django_db
def test_streaks_follow_the_users_day_before_midnight(
    client: Client,
    ada: User,
    freeze_time: Callable[[datetime], None],
) -> None:
    # Still Tuesday the 10th in Los Angeles, so the 10th is today and not yet a miss.
    set_time_zone(ada, "America/Los_Angeles")
    freeze_time(datetime(2026, 3, 11, 3, 0, tzinfo=UTC))
    habit_id = _create(client)
    _check_in(client, habit_id, _days_back(2, 4))

    assert _streaks(client, habit_id) == (3, 3, "days")
