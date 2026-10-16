"""Tests for a Task's due date, time and range through the Task endpoints."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from apps.tasks import creation, services

if TYPE_CHECKING:
    from collections.abc import Mapping

    from django.test import Client
    from django.test.client import _MonkeyPatchedWSGIResponse as Response

    from apps.accounts.models import User

TRIP = {
    "start_date": "2026-11-03",
    "start_time": "22:00",
    "due_date": "2026-11-04",
    "due_time": "06:30",
}
TRIP_OUT = {
    "start_date": "2026-11-03",
    "start_time": "22:00:00",
    "due_date": "2026-11-04",
    "due_time": "06:30:00",
}
REPORT_DAY = {"due_date": "2026-11-06", "due_time": None, "start_date": None, "start_time": None}


def _set_dates(client: Client, task_id: int, dates: Mapping[str, str | None] | None) -> Response:
    return client.patch(
        f"/api/v1/tasks/{task_id}",
        {"dates": dates},
        content_type="application/json",
    )


def _dates_of(client: Client, task_id: int) -> dict[str, str | None]:
    body = client.get(f"/api/v1/tasks/{task_id}").json()
    return {key: body[key] for key in ("start_date", "start_time", "due_date", "due_time")}


@pytest.mark.django_db
def test_a_task_can_get_a_timed_range(client: Client, ada: User) -> None:
    task = creation.create_task(services.inbox(ada), "Trip")

    response = _set_dates(client, task.pk, TRIP)

    assert response.status_code == 200
    assert _dates_of(client, task.pk) == TRIP_OUT


@pytest.mark.django_db
def test_a_due_date_without_a_time_is_all_day(client: Client, ada: User) -> None:
    task = creation.create_task(services.inbox(ada), "Report")

    _set_dates(client, task.pk, {"due_date": "2026-11-06"})

    assert _dates_of(client, task.pk) == {
        "start_date": None,
        "start_time": None,
        "due_date": "2026-11-06",
        "due_time": None,
    }


@pytest.mark.django_db
def test_null_dates_remove_them(client: Client, ada: User) -> None:
    task = creation.create_task(services.inbox(ada), "Report")
    _set_dates(client, task.pk, {"start_date": "2026-11-02", "due_date": "2026-11-06"})

    _set_dates(client, task.pk, None)

    assert set(_dates_of(client, task.pk).values()) == {None}


@pytest.mark.django_db
def test_a_patch_without_dates_keeps_them(client: Client, ada: User) -> None:
    task = creation.create_task(services.inbox(ada), "Report")
    _set_dates(client, task.pk, {"due_date": "2026-11-06", "due_time": "14:00"})

    client.patch(
        f"/api/v1/tasks/{task.pk}",
        {"title": "Q4 report"},
        content_type="application/json",
    )

    assert _dates_of(client, task.pk)["due_time"] == "14:00:00"


@pytest.mark.django_db
@pytest.mark.parametrize(
    "dates",
    [
        pytest.param({"due_time": "14:00"}, id="no due date"),
        pytest.param({"due_date": "2026-11-06", "due_time": "14:00:30"}, id="seconds"),
        pytest.param({"due_date": "2026-11-06", "start_time": "09:00"}, id="start time alone"),
        pytest.param({"start_date": "2026-11-07", "due_date": "2026-11-06"}, id="start after due"),
        pytest.param(
            {
                "start_date": "2026-11-06",
                "start_time": "15:00",
                "due_date": "2026-11-06",
                "due_time": "14:00",
            },
            id="start time after due time",
        ),
        pytest.param(
            {"start_date": "2026-11-02", "due_date": "2026-11-06", "due_time": "14:00"},
            id="all-day start, timed due",
        ),
        pytest.param(
            {"start_date": "2026-11-02", "start_time": "09:00", "due_date": "2026-11-06"},
            id="timed start, all-day due",
        ),
    ],
)
def test_invalid_dates_are_rejected(
    client: Client,
    ada: User,
    dates: dict[str, str | None],
) -> None:
    task = creation.create_task(services.inbox(ada), "Report")

    response = _set_dates(client, task.pk, dates)

    assert response.status_code == 422
    assert set(_dates_of(client, task.pk).values()) == {None}


@pytest.mark.django_db
def test_a_range_may_start_and_end_at_the_same_time(client: Client, ada: User) -> None:
    task = creation.create_task(services.inbox(ada), "Workshop")

    response = _set_dates(
        client,
        task.pk,
        {
            "start_date": "2026-11-06",
            "start_time": "09:00",
            "due_date": "2026-11-06",
            "due_time": "09:00",
        },
    )

    assert response.status_code == 200


@pytest.mark.django_db
def test_setting_another_users_task_dates_is_not_found(client: Client, grace: User) -> None:
    task = creation.create_task(services.inbox(grace), "Grace's")

    response = _set_dates(client, task.pk, {"due_date": "2026-11-06"})

    assert response.status_code == 404
    task.refresh_from_db()
    assert task.due_date is None


@pytest.mark.django_db
def test_date_changes_are_recorded_old_to_new(client: Client, ada: User) -> None:
    task = creation.create_task(services.inbox(ada), "Trip")
    _set_dates(client, task.pk, {"due_date": "2026-11-06"})
    _set_dates(client, task.pk, TRIP)
    _set_dates(client, task.pk, None)

    events = client.get(f"/api/v1/tasks/{task.pk}/activity").json()["items"]

    assert [event["data"] for event in events if event["kind"] == "dates_changed"] == [
        {"old": TRIP_OUT, "new": None},
        {"old": REPORT_DAY, "new": TRIP_OUT},
        {"old": None, "new": REPORT_DAY},
    ]


@pytest.mark.django_db
def test_setting_the_same_dates_records_nothing(client: Client, ada: User) -> None:
    task = creation.create_task(services.inbox(ada), "Report")
    _set_dates(client, task.pk, {"due_date": "2026-11-06"})

    _set_dates(client, task.pk, {"due_date": "2026-11-06"})

    events = client.get(f"/api/v1/tasks/{task.pk}/activity").json()["items"]
    assert [event["kind"] for event in events] == ["dates_changed", "created"]


@pytest.mark.django_db
def test_a_timed_task_gets_a_start_on_its_day_when_its_end_is_dragged(
    client: Client,
    ada: User,
) -> None:
    task = creation.create_task(services.inbox(ada), "Dentist")
    _set_dates(client, task.pk, {"due_date": "2026-11-06", "due_time": "14:00"})

    # The Calendar's resize keeps the block's top as the start and sets the end as due.
    response = _set_dates(
        client,
        task.pk,
        {
            "start_date": "2026-11-06",
            "start_time": "14:00",
            "due_date": "2026-11-06",
            "due_time": "15:30",
        },
    )

    assert response.status_code == 200
    assert _dates_of(client, task.pk) == {
        "start_date": "2026-11-06",
        "start_time": "14:00:00",
        "due_date": "2026-11-06",
        "due_time": "15:30:00",
    }


@pytest.mark.django_db
def test_a_timed_range_on_one_day_becomes_all_day_without_its_times(
    client: Client,
    ada: User,
) -> None:
    task = creation.create_task(services.inbox(ada), "Workshop")
    _set_dates(
        client,
        task.pk,
        {
            "start_date": "2026-11-06",
            "start_time": "09:00",
            "due_date": "2026-11-06",
            "due_time": "11:00",
        },
    )

    # Dropped in the Calendar's all-day strip of the next day.
    response = _set_dates(
        client,
        task.pk,
        {"start_date": None, "start_time": None, "due_date": "2026-11-07", "due_time": None},
    )

    assert response.status_code == 200
    assert _dates_of(client, task.pk) == {
        "start_date": None,
        "start_time": None,
        "due_date": "2026-11-07",
        "due_time": None,
    }
