"""Tests for the Habit endpoints: list the user's Habits and add one."""

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
@pytest.mark.parametrize("method", ["get", "post"])
def test_every_endpoint_requires_a_session(method: str) -> None:
    response = getattr(Client(), method)("/api/v1/habits")

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
