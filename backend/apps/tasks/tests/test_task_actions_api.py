"""Tests for the drawer's actions on a Task: pinning it and duplicating it."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

import pytest
from django.test import Client

from apps.tasks import services
from apps.tasks.models import Task

if TYPE_CHECKING:
    from django.test.client import _MonkeyPatchedWSGIResponse as Response

    from apps.accounts.models import User


def _titles(response: Response) -> list[str]:
    return [item["title"] for item in response.json()["items"]]


def _pin(client: Client, task: Task, *, pinned: bool) -> Response:
    return client.patch(
        f"/api/v1/tasks/{task.pk}",
        {"pinned": pinned},
        content_type="application/json",
    )


@pytest.mark.django_db
def test_duplicate_requires_a_session() -> None:
    response = Client().post("/api/v1/tasks/1/duplicate")

    assert response.status_code == 401


@pytest.mark.django_db
def test_pinning_a_task_records_when(client: Client, ada: User) -> None:
    task = services.create_task(services.inbox(ada), "Pay rent")

    response = _pin(client, task, pinned=True)

    assert response.status_code == 200
    assert response.json()["task"]["pinned_at"] is not None
    assert response.json()["affected"] == []


@pytest.mark.django_db
def test_unpinning_a_task_clears_when_it_was_pinned(client: Client, ada: User) -> None:
    task = services.create_task(services.inbox(ada), "Pay rent")
    _pin(client, task, pinned=True)

    response = _pin(client, task, pinned=False)

    assert response.status_code == 200
    assert response.json()["task"]["pinned_at"] is None


@pytest.mark.django_db
def test_pinning_a_pinned_task_keeps_its_place(client: Client, ada: User) -> None:
    task = services.create_task(services.inbox(ada), "Pay rent")
    first = _pin(client, task, pinned=True).json()["task"]["pinned_at"]

    again = _pin(client, task, pinned=True).json()["task"]["pinned_at"]

    assert again == first


@pytest.mark.django_db
def test_pinned_tasks_list_first_oldest_pin_first(client: Client, ada: User) -> None:
    inbox = services.inbox(ada)
    for title in ("Plain", "Pinned second", "Pinned first", "Newest"):
        services.create_task(inbox, title)
    start = datetime(2026, 10, 1, 9, tzinfo=UTC)
    Task.objects.filter(title="Pinned first").update(pinned_at=start)
    Task.objects.filter(title="Pinned second").update(pinned_at=start + timedelta(hours=1))

    response = client.get(f"/api/v1/tasks?project={inbox.pk}")

    assert _titles(response) == ["Pinned first", "Pinned second", "Newest", "Plain"]


@pytest.mark.django_db
def test_cannot_pin_another_users_task(client: Client, grace: User) -> None:
    task = services.create_task(services.inbox(grace), "Grace's")

    response = _pin(client, task, pinned=True)

    assert response.status_code == 404
    task.refresh_from_db()
    assert task.pinned_at is None


@pytest.mark.django_db
def test_duplicate_copies_title_description_and_priority(client: Client, ada: User) -> None:
    original = services.create_task(services.inbox(ada), "Plan the trip")
    services.update_task(
        ada,
        original.pk,
        services.TaskEdit(
            description="Book **trains**",
            priority=Task.Priority.P2,
            status=Task.Status.BLOCKED,
            blocked_reason="Waiting on dates",
        ),
    )
    _pin(client, original, pinned=True)

    response = client.post(f"/api/v1/tasks/{original.pk}/duplicate")

    assert response.status_code == 201
    body = response.json()
    assert body["id"] != original.pk
    assert body["title"] == "Plan the trip"
    assert body["priority"] == Task.Priority.P2
    assert body["status"] == "open"
    assert body["blocked_reason"] == ""
    assert body["pinned_at"] is None
    copy = client.get(f"/api/v1/tasks/{body['id']}").json()
    assert copy["description"] == "Book **trains**"


@pytest.mark.django_db
def test_duplicate_goes_right_after_the_original(client: Client, ada: User) -> None:
    inbox = services.inbox(ada)
    services.create_task(inbox, "Last")
    original = services.create_task(inbox, "Middle")
    services.create_task(inbox, "First")

    copy = client.post(f"/api/v1/tasks/{original.pk}/duplicate").json()

    listed = client.get(f"/api/v1/tasks?project={inbox.pk}").json()["items"]
    assert [item["title"] for item in listed] == ["First", "Middle", "Middle", "Last"]
    assert listed[2]["id"] == copy["id"]


@pytest.mark.django_db
def test_duplicate_of_the_last_task_goes_last(client: Client, ada: User) -> None:
    inbox = services.inbox(ada)
    original = services.create_task(inbox, "Last")
    services.create_task(inbox, "First")

    response = client.post(f"/api/v1/tasks/{original.pk}/duplicate")

    assert response.status_code == 201
    assert _titles(client.get(f"/api/v1/tasks?project={inbox.pk}")) == ["First", "Last", "Last"]


@pytest.mark.django_db
def test_duplicate_another_users_task_is_not_found(client: Client, grace: User) -> None:
    task = services.create_task(services.inbox(grace), "Grace's")

    response = client.post(f"/api/v1/tasks/{task.pk}/duplicate")

    assert response.status_code == 404
    assert grace.tasks.count() == 1
