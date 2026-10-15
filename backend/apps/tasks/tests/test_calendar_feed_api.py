"""Tests for the Calendar feed: turning it on, off and over, and the `.ics` body it serves."""

from __future__ import annotations

from datetime import date, time
from typing import TYPE_CHECKING

import pytest
from django.core.cache import cache
from django.test import Client
from django.utils import timezone
from icalendar import Calendar

from apps.tasks import people, projects, services
from apps.tasks.models import Project, Task

if TYPE_CHECKING:
    from collections.abc import Iterator

    from pytest_django import Settings

    from apps.accounts.models import User


_DUE = date(2026, 10, 20)


@pytest.fixture(autouse=True)
def public_url(settings: Settings) -> None:
    settings.PUBLIC_URL = "https://nudge.example.com"


@pytest.fixture(autouse=True)
def _reset_rate_limits() -> Iterator[None]:
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def feed_path(client: Client) -> str:
    url: str = client.post("/api/v1/calendar/feed").json()["url"]
    return url.removeprefix("https://nudge.example.com")


def _task(project: Project, *, title: str = "Pay rent", **dates: date | time | None) -> Task:
    task = services.create_task(project, title)
    Task.objects.filter(pk=task.pk).update(**dates)
    return task


def _events(client: Client, feed_path: str) -> dict[str, str]:
    """Fetch the feed and return each event's unfolded text by its UID."""
    response = client.get(feed_path)
    assert response.status_code == 200
    events = Calendar.from_ical(response.content).walk("VEVENT")
    return {str(event["UID"]): event.to_ical().decode().replace("\r\n ", "") for event in events}


@pytest.mark.django_db
@pytest.mark.parametrize("method", ["get", "post", "delete"])
def test_managing_the_feed_requires_a_session(method: str) -> None:
    response = getattr(Client(), method)("/api/v1/calendar/feed")

    assert response.status_code == 401


@pytest.mark.django_db
def test_the_feed_is_off_by_default(client: Client) -> None:
    response = client.get("/api/v1/calendar/feed")

    assert response.status_code == 200
    assert response.json() == {"url": None}


@pytest.mark.django_db
def test_turning_the_feed_on_returns_a_private_url(client: Client) -> None:
    response = client.post("/api/v1/calendar/feed")

    assert response.status_code == 200
    url = response.json()["url"]
    assert url.startswith("https://nudge.example.com/api/v1/calendar/")
    assert url.endswith(".ics")
    assert client.get("/api/v1/calendar/feed").json() == {"url": url}


@pytest.mark.django_db
def test_the_feed_is_served_without_a_session(feed_path: str) -> None:
    response = Client().get(feed_path)

    assert response.status_code == 200
    assert response["Content-Type"] == "text/calendar; charset=utf-8"


@pytest.mark.django_db
def test_resetting_the_feed_retires_the_old_address(client: Client, feed_path: str) -> None:
    new_url = client.post("/api/v1/calendar/feed").json()["url"]

    assert Client().get(feed_path).status_code == 404
    assert Client().get(new_url.removeprefix("https://nudge.example.com")).status_code == 200


@pytest.mark.django_db
def test_turning_the_feed_off_retires_its_address(client: Client, feed_path: str) -> None:
    response = client.delete("/api/v1/calendar/feed")

    assert response.status_code == 204
    assert client.get("/api/v1/calendar/feed").json() == {"url": None}
    assert Client().get(feed_path).status_code == 404


@pytest.mark.django_db
def test_an_unknown_address_is_not_found() -> None:
    response = Client().get("/api/v1/calendar/not-a-real-token.ics")

    assert response.status_code == 404


@pytest.mark.django_db
def test_a_deactivated_users_feed_is_not_found(ada: User, feed_path: str) -> None:
    ada.is_active = False
    ada.save(update_fields=["is_active"])

    assert Client().get(feed_path).status_code == 404


@pytest.mark.django_db
def test_the_feed_is_rate_limited_per_ip(feed_path: str) -> None:
    statuses = [Client().get(feed_path).status_code for _ in range(31)]

    assert statuses[:30] == [200] * 30
    assert statuses[30] == 429


@pytest.mark.django_db
def test_the_calendar_asks_to_be_refreshed_hourly(client: Client, feed_path: str) -> None:
    body = client.get(feed_path).content.decode()

    assert "REFRESH-INTERVAL;VALUE=DURATION:PT1H\r\n" in body
    assert "X-PUBLISHED-TTL:PT1H\r\n" in body


@pytest.mark.django_db
def test_the_feed_holds_open_and_blocked_dated_tasks_and_subtasks(
    ada: User,
    client: Client,
    feed_path: str,
) -> None:
    inbox = services.inbox(ada)
    open_task = _task(inbox, due_date=_DUE)
    blocked = _task(inbox, due_date=_DUE)
    Task.objects.filter(pk=blocked.pk).update(status=Task.Status.BLOCKED)
    subtask = services.create_subtask(open_task, "Find the chequebook").task
    Task.objects.filter(pk=subtask.pk).update(due_date=_DUE)

    uids = set(_events(client, feed_path))

    assert uids == {
        f"task-{open_task.pk}@nudge.example.com",
        f"task-{blocked.pk}@nudge.example.com",
        f"task-{subtask.pk}@nudge.example.com",
    }


@pytest.mark.django_db
def test_the_feed_leaves_out_closed_undated_trashed_and_archived_tasks(
    ada: User,
    grace: User,
    client: Client,
    feed_path: str,
) -> None:
    inbox = services.inbox(ada)
    _task(inbox)
    completed = _task(inbox, due_date=_DUE)
    Task.objects.filter(pk=completed.pk).update(
        status=Task.Status.COMPLETED,
        completed_at=timezone.now(),
    )
    trashed = _task(inbox, due_date=_DUE)
    Task.objects.filter(pk=trashed.pk).update(deleted_at=timezone.now())
    shelved = projects.create_project(ada, "Shelved")
    _task(shelved, due_date=_DUE)
    projects.archive_project(ada, shelved.pk)
    _task(services.inbox(grace), due_date=_DUE)

    assert _events(client, feed_path) == {}


@pytest.mark.django_db
def test_an_all_day_task_ends_the_next_day(ada: User, client: Client, feed_path: str) -> None:
    task = _task(services.inbox(ada), due_date=date(2026, 10, 20))

    event = _events(client, feed_path)[f"task-{task.pk}@nudge.example.com"]

    assert "DTSTART;VALUE=DATE:20261020\r\n" in event
    assert "DTEND;VALUE=DATE:20261021\r\n" in event


@pytest.mark.django_db
def test_an_all_day_range_ends_the_day_after_its_due_date(
    ada: User,
    client: Client,
    feed_path: str,
) -> None:
    task = _task(
        services.inbox(ada),
        start_date=date(2026, 10, 30),
        due_date=date(2026, 11, 2),
    )

    event = _events(client, feed_path)[f"task-{task.pk}@nudge.example.com"]

    assert "DTSTART;VALUE=DATE:20261030\r\n" in event
    assert "DTEND;VALUE=DATE:20261103\r\n" in event


@pytest.mark.django_db
def test_a_timed_task_is_half_an_hour_ending_at_its_due_time_in_the_users_zone(
    ada: User,
    client: Client,
    feed_path: str,
) -> None:
    ada.time_zone = "Asia/Kolkata"
    ada.save(update_fields=["time_zone"])
    task = _task(services.inbox(ada), due_date=date(2026, 10, 20), due_time=time(0, 15))

    response = client.get(feed_path)
    event = _events(client, feed_path)[f"task-{task.pk}@nudge.example.com"]

    assert "DTSTART;TZID=Asia/Kolkata:20261019T234500\r\n" in event
    assert "DTEND;TZID=Asia/Kolkata:20261020T001500\r\n" in event
    zones = Calendar.from_ical(response.content).walk("VTIMEZONE")
    assert [str(zone["TZID"]) for zone in zones] == ["Asia/Kolkata"]


@pytest.mark.django_db
def test_a_timed_range_runs_from_its_start_to_its_due(
    ada: User,
    client: Client,
    feed_path: str,
) -> None:
    ada.time_zone = "America/New_York"
    ada.save(update_fields=["time_zone"])
    task = _task(
        services.inbox(ada),
        start_date=date(2026, 10, 31),
        start_time=time(22, 0),
        due_date=date(2026, 11, 1),
        due_time=time(2, 30),
    )

    event = _events(client, feed_path)[f"task-{task.pk}@nudge.example.com"]

    assert "DTSTART;TZID=America/New_York:20261031T220000\r\n" in event
    assert "DTEND;TZID=America/New_York:20261101T023000\r\n" in event


@pytest.mark.django_db
def test_the_summary_shows_mentions_as_plain_names(
    ada: User,
    client: Client,
    feed_path: str,
) -> None:
    alice = people.create_person(ada, "Alice Smith")
    task = _task(
        services.inbox(ada),
        title=f"Call [@Alice Smith](person:{alice.pk}) about the lease",
        due_date=date(2026, 10, 20),
    )

    event = _events(client, feed_path)[f"task-{task.pk}@nudge.example.com"]

    assert "SUMMARY:Call Alice Smith about the lease\r\n" in event


@pytest.mark.django_db
def test_the_description_names_the_project_then_the_notes_then_a_link(
    ada: User,
    client: Client,
    feed_path: str,
) -> None:
    home = projects.create_project(ada, "Home")
    task = _task(home, due_date=date(2026, 10, 20))
    Task.objects.filter(pk=task.pk).update(description="Ask [@Bo](person:3) first")
    in_inbox = _task(services.inbox(ada), due_date=date(2026, 10, 20))

    events = _events(client, feed_path)

    assert (
        "DESCRIPTION:Home\\n\\nAsk Bo first\\n\\n"
        f"https://nudge.example.com/projects/{home.pk}?task={task.pk}\r\n"
    ) in events[f"task-{task.pk}@nudge.example.com"]
    assert (
        f"DESCRIPTION:Inbox\\n\\nhttps://nudge.example.com/inbox?task={in_inbox.pk}\r\n"
    ) in events[f"task-{in_inbox.pk}@nudge.example.com"]
