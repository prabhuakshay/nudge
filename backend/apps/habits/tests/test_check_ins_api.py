"""Tests for a Habit's Check-ins: setting a day's count and reading days back."""

from __future__ import annotations

from datetime import UTC, date, datetime
from typing import TYPE_CHECKING

import pytest
from django.test import Client

from apps.accounts import services as accounts
from apps.habits.models import CheckIn

if TYPE_CHECKING:
    from collections.abc import Callable

    from django.test.client import _MonkeyPatchedWSGIResponse as Response

    from apps.accounts.models import User

NOW = datetime(2026, 3, 10, 12, 0, tzinfo=UTC)


def _create(client: Client, data: object) -> Response:
    return client.post("/api/v1/habits", data, content_type="application/json")


def _habit(name: str = "Read") -> dict[str, str]:
    return {"name": name, "icon": "book-open", "color": "teal"}


def _check_in(client: Client, habit_id: int, day: str, count: int) -> Response:
    return client.put(
        f"/api/v1/habits/{habit_id}/check-ins/{day}",
        {"count": count},
        content_type="application/json",
    )


def _today_counts(client: Client) -> list[int]:
    return [habit["today_count"] for habit in client.get("/api/v1/habits").json()]


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("put", "/api/v1/habits/1/check-ins/2026-03-10"),
        ("get", "/api/v1/habits/1/check-ins?start=2026-03-01&end=2026-03-10"),
    ],
)
def test_check_ins_require_a_session(method: str, path: str) -> None:
    response = getattr(Client(), method)(path)

    assert response.status_code == 401


@pytest.mark.django_db
def test_checking_in_today_counts_toward_the_goal(
    client: Client,
    freeze_time: Callable[[datetime], None],
) -> None:
    freeze_time(NOW)
    habit = _create(client, {**_habit(), "goal": 8}).json()
    assert habit["today_count"] == 0

    response = _check_in(client, habit["id"], "2026-03-10", 3)

    assert response.status_code == 200
    assert response.json()["today_count"] == 3
    assert _today_counts(client) == [3]


@pytest.mark.django_db
def test_setting_the_same_count_twice_changes_nothing(
    client: Client,
    freeze_time: Callable[[datetime], None],
) -> None:
    freeze_time(NOW)
    habit = _create(client, {**_habit(), "goal": 8}).json()

    _check_in(client, habit["id"], "2026-03-10", 2)
    again = _check_in(client, habit["id"], "2026-03-10", 2)

    assert again.status_code == 200
    assert _today_counts(client) == [2]


@pytest.mark.django_db
def test_a_count_of_zero_clears_the_day(
    client: Client,
    freeze_time: Callable[[datetime], None],
) -> None:
    freeze_time(NOW)
    habit = _create(client, _habit()).json()
    _check_in(client, habit["id"], "2026-03-10", 1)

    cleared = _check_in(client, habit["id"], "2026-03-10", 0)

    assert cleared.status_code == 200
    assert cleared.json()["today_count"] == 0
    assert not CheckIn.objects.exists()


@pytest.mark.django_db
def test_check_ins_are_capped_at_the_goal(
    client: Client,
    freeze_time: Callable[[datetime], None],
) -> None:
    freeze_time(NOW)
    habit = _create(client, {**_habit(), "goal": 2}).json()
    _check_in(client, habit["id"], "2026-03-10", 2)

    response = _check_in(client, habit["id"], "2026-03-10", 3)

    assert response.status_code == 422
    assert response.json()["detail"] == "A day can't have more Check-ins than the Goal of 2."
    assert _today_counts(client) == [2]


@pytest.mark.django_db
def test_a_count_below_zero_is_refused(
    client: Client,
    freeze_time: Callable[[datetime], None],
) -> None:
    freeze_time(NOW)
    habit = _create(client, _habit()).json()

    response = _check_in(client, habit["id"], "2026-03-10", -1)

    assert response.status_code == 422


@pytest.mark.django_db
def test_a_day_that_hasnt_come_yet_cant_be_checked_in(
    client: Client,
    freeze_time: Callable[[datetime], None],
) -> None:
    freeze_time(NOW)
    habit = _create(client, _habit()).json()

    response = _check_in(client, habit["id"], "2026-03-11", 1)

    assert response.status_code == 422
    assert response.json()["detail"] == "You can't check in for a day that hasn't come yet."


@pytest.mark.django_db
def test_a_day_before_the_habit_started_cant_be_checked_in(
    client: Client,
    freeze_time: Callable[[datetime], None],
) -> None:
    freeze_time(NOW)
    habit = _create(client, _habit()).json()

    response = _check_in(client, habit["id"], "2026-03-09", 1)

    assert response.status_code == 422
    assert response.json()["detail"] == "You can't check in for a day before the Habit started."


@pytest.mark.django_db
def test_today_follows_the_users_time_zone_around_midnight(
    client: Client,
    ada: User,
    freeze_time: Callable[[datetime], None],
) -> None:
    accounts.set_time_zone(ada, "Asia/Kolkata")
    freeze_time(datetime(2026, 3, 10, 18, 0, tzinfo=UTC))
    habit = _create(client, _habit()).json()
    late_evening = _check_in(client, habit["id"], "2026-03-10", 1)
    freeze_time(datetime(2026, 3, 10, 18, 45, tzinfo=UTC))

    after_midnight = _check_in(client, habit["id"], "2026-03-11", 1)

    assert late_evening.json()["today_count"] == 1
    assert after_midnight.status_code == 200
    assert after_midnight.json()["today_count"] == 1
    assert list(CheckIn.objects.values_list("date", "count")) == [
        (date(2026, 3, 10), 1),
        (date(2026, 3, 11), 1),
    ]


@pytest.mark.django_db
def test_checking_in_cannot_reach_another_users_habit(
    client: Client,
    grace: User,
    freeze_time: Callable[[datetime], None],
) -> None:
    freeze_time(NOW)
    other = Client()
    other.force_login(grace)
    graces = _create(other, _habit()).json()

    response = _check_in(client, graces["id"], "2026-03-10", 1)

    assert response.status_code == 404
    assert _today_counts(other) == [0]


@pytest.mark.django_db
def test_check_ins_read_back_for_the_days_asked_for(
    client: Client,
    freeze_time: Callable[[datetime], None],
) -> None:
    freeze_time(NOW)
    habit = _create(client, {**_habit(), "goal": 3, "start_date": "2026-03-01"}).json()
    for day, count in [("2026-03-02", 1), ("2026-03-04", 3), ("2026-03-08", 2)]:
        _check_in(client, habit["id"], day, count)

    response = client.get(
        f"/api/v1/habits/{habit['id']}/check-ins",
        {"start": "2026-03-03", "end": "2026-03-08"},
    )

    assert response.status_code == 200
    assert response.json() == [
        {"date": "2026-03-04", "count": 3},
        {"date": "2026-03-08", "count": 2},
    ]


@pytest.mark.django_db
def test_reading_check_ins_cannot_reach_another_users_habit(
    client: Client,
    grace: User,
    freeze_time: Callable[[datetime], None],
) -> None:
    freeze_time(NOW)
    other = Client()
    other.force_login(grace)
    graces = _create(other, _habit()).json()
    _check_in(other, graces["id"], "2026-03-10", 1)

    response = client.get(
        f"/api/v1/habits/{graces['id']}/check-ins",
        {"start": "2026-03-01", "end": "2026-03-10"},
    )

    assert response.status_code == 404


@pytest.mark.django_db
def test_checking_in_a_missing_habit_is_not_found(client: Client) -> None:
    response = _check_in(client, 999, "2026-03-10", 1)

    assert response.status_code == 404
    assert response.json()["detail"] == "Habit not found."
