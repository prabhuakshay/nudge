"""Tests for marking a dated Task as a Countdown through the Task endpoints."""

from __future__ import annotations

from datetime import date
from typing import TYPE_CHECKING

import pytest

from apps.tasks import creation, services
from apps.tasks.dates import TaskDates
from apps.tasks.models import TaskActivity

if TYPE_CHECKING:
    from django.test import Client
    from django.test.client import _MonkeyPatchedWSGIResponse as Response

    from apps.accounts.models import User
    from apps.tasks.models import Task

EXAM_DAY = {"due_date": "2026-11-06"}


def _patch(client: Client, task_id: int, body: dict[str, object]) -> Response:
    return client.patch(f"/api/v1/tasks/{task_id}", body, content_type="application/json")


def _dated(user: User) -> Task:
    dates = TaskDates(date(2026, 11, 6))
    return creation.create_task(services.inbox(user), "Exam", creation.NewTask(dates=dates))


@pytest.mark.django_db
def test_a_dated_task_can_be_marked_as_a_countdown(client: Client, ada: User) -> None:
    task = _dated(ada)

    response = _patch(client, task.pk, {"countdown": True})

    assert response.status_code == 200
    assert response.json()["task"]["countdown"] is True
    assert client.get(f"/api/v1/tasks/{task.pk}").json()["countdown"] is True


@pytest.mark.django_db
def test_a_task_is_not_a_countdown_by_default(client: Client, ada: User) -> None:
    task = _dated(ada)

    assert client.get(f"/api/v1/tasks/{task.pk}").json()["countdown"] is False


@pytest.mark.django_db
def test_a_countdown_can_be_unmarked(client: Client, ada: User) -> None:
    task = _dated(ada)
    _patch(client, task.pk, {"countdown": True})

    response = _patch(client, task.pk, {"countdown": False})

    assert response.json()["task"]["countdown"] is False


@pytest.mark.django_db
def test_an_undated_task_cant_be_a_countdown(client: Client, ada: User) -> None:
    task = creation.create_task(services.inbox(ada), "Someday")

    response = _patch(client, task.pk, {"countdown": True})

    assert response.status_code == 422
    assert response.json()["detail"] == "Only a dated task can be a countdown."


@pytest.mark.django_db
def test_dates_and_the_mark_can_be_set_together(client: Client, ada: User) -> None:
    task = creation.create_task(services.inbox(ada), "Exam")

    response = _patch(client, task.pk, {"dates": EXAM_DAY, "countdown": True})

    assert response.json()["task"]["countdown"] is True


@pytest.mark.django_db
def test_clearing_the_date_clears_the_mark(client: Client, ada: User) -> None:
    task = _dated(ada)
    _patch(client, task.pk, {"countdown": True})

    response = _patch(client, task.pk, {"dates": None})

    assert response.status_code == 200
    assert response.json()["task"]["countdown"] is False


@pytest.mark.django_db
def test_quick_add_can_add_a_countdown(client: Client) -> None:
    response = client.post(
        "/api/v1/tasks",
        {"title": "Exam", "dates": EXAM_DAY, "countdown": True},
        content_type="application/json",
    )

    assert response.status_code == 201
    assert response.json()["countdown"] is True


@pytest.mark.django_db
def test_quick_add_without_a_date_cant_add_a_countdown(client: Client, ada: User) -> None:
    response = client.post(
        "/api/v1/tasks",
        {"title": "Exam", "countdown": True},
        content_type="application/json",
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "Only a dated task can be a countdown."
    assert not ada.tasks.exists()


@pytest.mark.django_db
def test_marking_and_unmarking_are_recorded_in_activity(client: Client, ada: User) -> None:
    task = _dated(ada)

    _patch(client, task.pk, {"countdown": True})
    _patch(client, task.pk, {"countdown": False})

    kinds = list(task.activity.order_by("id").values_list("kind", flat=True))
    assert kinds[-2:] == [TaskActivity.Kind.COUNTDOWN_MARKED, TaskActivity.Kind.COUNTDOWN_UNMARKED]
    response = client.get(f"/api/v1/tasks/{task.pk}/activity")
    assert [item["kind"] for item in response.json()["items"][:2]] == [
        "countdown_unmarked",
        "countdown_marked",
    ]


@pytest.mark.django_db
def test_marking_another_users_task_is_not_found(client: Client, grace: User) -> None:
    task = _dated(grace)

    response = _patch(client, task.pk, {"countdown": True})

    assert response.status_code == 404
    task.refresh_from_db()
    assert task.countdown is False
