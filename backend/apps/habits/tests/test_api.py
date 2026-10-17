"""Tests for the Habit endpoints: list, add, move, archive, unarchive, delete and check in."""

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


def _names(client: Client) -> list[str]:
    return [habit["name"] for habit in client.get("/api/v1/habits").json()]


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
        ("get", "/api/v1/habits"),
        ("post", "/api/v1/habits"),
        ("put", "/api/v1/habits/1/check-ins/2026-03-10"),
    ],
)
def test_every_endpoint_requires_a_session(method: str, path: str) -> None:
    response = getattr(Client(), method)(path)

    assert response.status_code == 401


@pytest.mark.django_db
def test_create_adds_a_daily_habit_the_list_then_shows(client: Client) -> None:
    created = _create(client, {"name": "  Read  ", "icon": "book-open", "color": "teal"})

    assert created.status_code == 201
    body = created.json()
    assert body["name"] == "Read"
    assert body["icon"] == "book-open"
    assert body["color"] == "teal"
    assert body["frequency"] == "daily"
    listed = client.get("/api/v1/habits")
    assert listed.status_code == 200
    assert listed.json() == [body]


@pytest.mark.django_db
def test_new_habits_go_last(client: Client) -> None:
    for name in ["Read", "Run", "Meditate"]:
        _create(client, _habit(name))

    assert _names(client) == ["Read", "Run", "Meditate"]


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("time_zone", "start_date"),
    [("Asia/Kolkata", "2026-03-11"), ("America/Los_Angeles", "2026-03-10")],
)
def test_a_habit_starts_today_in_the_users_time_zone(
    client: Client,
    ada: User,
    freeze_time: Callable[[datetime], None],
    time_zone: str,
    start_date: str,
) -> None:
    accounts.set_time_zone(ada, time_zone)
    freeze_time(datetime(2026, 3, 10, 22, 30, tzinfo=UTC))

    created = _create(client, _habit())

    assert created.json()["start_date"] == start_date


@pytest.mark.django_db
@pytest.mark.parametrize("name", ["", "   ", "x" * 101])
def test_create_refuses_an_empty_or_overlong_name(client: Client, name: str) -> None:
    response = _create(client, _habit(name))

    assert response.status_code == 422
    assert _names(client) == []


@pytest.mark.django_db
def test_create_keeps_a_name_of_the_longest_length(client: Client) -> None:
    response = _create(client, _habit("x" * 100))

    assert response.status_code == 201


@pytest.mark.django_db
@pytest.mark.parametrize("field", ["icon", "color"])
def test_create_refuses_an_unknown_icon_or_colour(client: Client, field: str) -> None:
    response = _create(client, {**_habit(), field: "sparkles"})

    assert response.status_code == 422


@pytest.mark.django_db
def test_the_list_never_shows_another_users_habits(client: Client, grace: User) -> None:
    other = Client()
    other.force_login(grace)
    _create(other, _habit("Grace's"))
    _create(client, _habit("Ada's"))

    assert _names(client) == ["Ada's"]
    assert _names(other) == ["Grace's"]


@pytest.mark.django_db
def test_a_new_habits_goal_is_one_unless_set(client: Client) -> None:
    default = _create(client, _habit("Read"))
    eight = _create(client, {**_habit("Drink water"), "goal": 8})

    assert default.json()["goal"] == 1
    assert eight.json()["goal"] == 8


@pytest.mark.django_db
@pytest.mark.parametrize(("goal", "status"), [(0, 422), (1, 201), (99, 201), (100, 422)])
def test_create_keeps_the_goal_between_1_and_99(client: Client, goal: int, status: int) -> None:
    response = _create(client, {**_habit(), "goal": goal})

    assert response.status_code == status


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
def test_checking_in_a_missing_habit_is_not_found(client: Client) -> None:
    response = _check_in(client, 999, "2026-03-10", 1)

    assert response.status_code == 404
    assert response.json()["detail"] == "Habit not found."


def _post(client: Client, path: str, data: object = None) -> Response:
    return client.post(path, data, content_type="application/json")


@pytest.mark.django_db
def test_archive_keeps_the_habit_in_the_list_marked_archived(client: Client) -> None:
    habit = _create(client, _habit()).json()
    assert habit["is_archived"] is False

    archived = _post(client, f"/api/v1/habits/{habit['id']}/archive")

    assert archived.status_code == 200
    assert archived.json()["is_archived"] is True
    assert client.get("/api/v1/habits").json() == [archived.json()]


@pytest.mark.django_db
def test_archiving_twice_is_harmless(client: Client) -> None:
    habit_id = _create(client, _habit()).json()["id"]
    _post(client, f"/api/v1/habits/{habit_id}/archive")

    again = _post(client, f"/api/v1/habits/{habit_id}/archive")

    assert again.status_code == 200
    assert again.json()["is_archived"] is True


@pytest.mark.django_db
def test_unarchive_brings_the_habit_back_in_its_place(client: Client) -> None:
    ids = [_create(client, _habit(name)).json()["id"] for name in ["Read", "Run", "Meditate"]]
    _post(client, f"/api/v1/habits/{ids[1]}/archive")

    unarchived = _post(client, f"/api/v1/habits/{ids[1]}/unarchive")

    assert unarchived.status_code == 200
    assert unarchived.json()["is_archived"] is False
    assert _names(client) == ["Read", "Run", "Meditate"]


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("moving", "after", "order"),
    [
        ("Meditate", "Read", ["Read", "Meditate", "Run"]),
        ("Meditate", None, ["Meditate", "Read", "Run"]),
        ("Read", "Meditate", ["Run", "Meditate", "Read"]),
        ("Run", "Run", ["Read", "Run", "Meditate"]),
    ],
)
def test_move_puts_a_habit_right_after_another_or_first(
    client: Client,
    moving: str,
    after: str | None,
    order: list[str],
) -> None:
    ids = {name: _create(client, _habit(name)).json()["id"] for name in ["Read", "Run", "Meditate"]}

    response = _post(
        client,
        f"/api/v1/habits/{ids[moving]}/move",
        {"after_id": None if after is None else ids[after]},
    )

    assert response.status_code == 204
    assert _names(client) == order


@pytest.mark.django_db
def test_move_after_a_habit_that_isnt_there_puts_it_last(client: Client) -> None:
    ids = [_create(client, _habit(name)).json()["id"] for name in ["Read", "Run"]]

    _post(client, f"/api/v1/habits/{ids[0]}/move", {"after_id": 999_999})

    assert _names(client) == ["Run", "Read"]


@pytest.mark.django_db
def test_delete_removes_the_habit_for_good(client: Client) -> None:
    ids = [_create(client, _habit(name)).json()["id"] for name in ["Read", "Run"]]

    response = client.delete(f"/api/v1/habits/{ids[0]}")

    assert response.status_code == 204
    assert _names(client) == ["Run"]
    assert client.delete(f"/api/v1/habits/{ids[0]}").status_code == 404


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("method", "action", "data"),
    [
        ("post", "/move", {"after_id": None}),
        ("post", "/archive", None),
        ("post", "/unarchive", None),
        ("delete", "", None),
    ],
)
def test_actions_cannot_reach_another_users_habit(
    client: Client,
    grace: User,
    method: str,
    action: str,
    data: object,
) -> None:
    other = Client()
    other.force_login(grace)
    _create(other, _habit("Grace's first"))
    habit_id = _create(other, _habit("Grace's second")).json()["id"]
    before = other.get("/api/v1/habits").json()

    response = getattr(client, method)(
        f"/api/v1/habits/{habit_id}{action}",
        data,
        content_type="application/json",
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Habit not found."}
    assert other.get("/api/v1/habits").json() == before


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("post", "/api/v1/habits/1/move"),
        ("post", "/api/v1/habits/1/archive"),
        ("post", "/api/v1/habits/1/unarchive"),
        ("delete", "/api/v1/habits/1"),
    ],
)
def test_actions_require_a_session(method: str, path: str) -> None:
    response = getattr(Client(), method)(path, None, content_type="application/json")

    assert response.status_code == 401
