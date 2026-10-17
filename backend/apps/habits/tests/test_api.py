"""Tests for the Habit endpoints: list, add, move, archive, unarchive and delete Habits."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING

import pytest
from django.test import Client

from apps.accounts import services as accounts

if TYPE_CHECKING:
    from collections.abc import Callable

    from django.test.client import _MonkeyPatchedWSGIResponse as Response

    from apps.accounts.models import User


def _create(client: Client, data: object) -> Response:
    return client.post("/api/v1/habits", data, content_type="application/json")


def _habit(name: str = "Read") -> dict[str, str]:
    return {"name": name, "icon": "book-open", "color": "teal"}


def _names(client: Client) -> list[str]:
    return [habit["name"] for habit in client.get("/api/v1/habits").json()]


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("method", "path"),
    [("get", "/api/v1/habits"), ("post", "/api/v1/habits"), ("patch", "/api/v1/habits/1")],
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
