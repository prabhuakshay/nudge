"""Tests for the Task Activity endpoint."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

import pytest
from django.test import Client

from apps.tasks import services
from apps.tasks.models import TaskActivity

if TYPE_CHECKING:
    from django.test.client import _MonkeyPatchedWSGIResponse as Response

    from apps.accounts.models import User


def _kinds(response: Response) -> list[str]:
    return [item["kind"] for item in response.json()["items"]]


@pytest.mark.django_db
def test_activity_requires_a_session() -> None:
    response = Client().get("/api/v1/tasks/1/activity")

    assert response.status_code == 401


@pytest.mark.django_db
def test_a_new_task_has_a_created_event(client: Client, ada: User) -> None:
    task = services.create_task(services.inbox(ada), "Buy milk")

    response = client.get(f"/api/v1/tasks/{task.pk}/activity")

    assert response.status_code == 200
    body = response.json()
    event = body["items"][0]
    assert body == {
        "items": [{"id": event["id"], "kind": "created", "at": event["at"], "data": {}}],
        "next_cursor": None,
        "count": 1,
    }


@pytest.mark.django_db
def test_renaming_records_the_old_and_new_title(client: Client, ada: User) -> None:
    task = services.create_task(services.inbox(ada), "Buy milk")

    client.patch(
        f"/api/v1/tasks/{task.pk}",
        {"title": "Buy oat milk"},
        content_type="application/json",
    )

    newest = client.get(f"/api/v1/tasks/{task.pk}/activity").json()["items"][0]
    assert newest["kind"] == "title_changed"
    assert newest["data"] == {"old": "Buy milk", "new": "Buy oat milk"}


@pytest.mark.django_db
def test_editing_the_description_records_that_it_changed_but_not_how(
    client: Client,
    ada: User,
) -> None:
    task = services.create_task(services.inbox(ada), "Buy milk")

    client.patch(
        f"/api/v1/tasks/{task.pk}",
        {"description": "Oat, not dairy"},
        content_type="application/json",
    )

    newest = client.get(f"/api/v1/tasks/{task.pk}/activity").json()["items"][0]
    assert newest["kind"] == "description_edited"
    assert newest["data"] == {}


@pytest.mark.django_db
def test_saving_unchanged_text_records_nothing(client: Client, ada: User) -> None:
    task = services.create_task(services.inbox(ada), "Buy milk")

    client.patch(
        f"/api/v1/tasks/{task.pk}",
        {"title": "Buy milk", "description": ""},
        content_type="application/json",
    )

    assert _kinds(client.get(f"/api/v1/tasks/{task.pk}/activity")) == ["created"]


@pytest.mark.django_db
def test_events_come_newest_first_in_pages_of_fifty(client: Client, ada: User) -> None:
    task = services.create_task(services.inbox(ada), "Title 0")
    for number in range(1, 55):
        services.update_task(ada, task.pk, services.TaskEdit(title=f"Title {number}"))
    start = datetime(2026, 10, 1, 9, tzinfo=UTC)
    for minute, event in enumerate(task.activity.order_by("id")):
        TaskActivity.objects.filter(pk=event.pk).update(at=start + timedelta(minutes=minute))

    first = client.get(f"/api/v1/tasks/{task.pk}/activity")
    cursor = first.json()["next_cursor"]
    second = client.get(f"/api/v1/tasks/{task.pk}/activity?cursor={cursor}")

    assert first.json()["count"] == 55
    assert [item["data"]["new"] for item in first.json()["items"][:2]] == ["Title 54", "Title 53"]
    assert len(first.json()["items"]) == 50
    assert _kinds(second) == ["title_changed"] * 4 + ["created"]
    assert second.json()["next_cursor"] is None


@pytest.mark.django_db
def test_activity_rejects_a_malformed_cursor(client: Client, ada: User) -> None:
    task = services.create_task(services.inbox(ada), "Buy milk")

    response = client.get(f"/api/v1/tasks/{task.pk}/activity?cursor=nonsense")

    assert response.status_code == 422


@pytest.mark.django_db
def test_activity_of_another_users_task_is_not_found(client: Client, grace: User) -> None:
    task = services.create_task(services.inbox(grace), "Private")

    response = client.get(f"/api/v1/tasks/{task.pk}/activity")

    assert response.status_code == 404


@pytest.mark.django_db
def test_activity_of_a_trashed_task_is_not_found(client: Client, ada: User) -> None:
    task = services.create_task(services.inbox(ada), "Gone")
    task.deleted_at = datetime(2026, 10, 1, tzinfo=UTC)
    task.save()

    response = client.get(f"/api/v1/tasks/{task.pk}/activity")

    assert response.status_code == 404


@pytest.mark.django_db
def test_blocking_records_the_status_change_with_its_reason(client: Client, ada: User) -> None:
    task = services.create_task(services.inbox(ada), "Ship the release")

    client.patch(
        f"/api/v1/tasks/{task.pk}",
        {"status": "blocked", "blocked_reason": "Waiting on review"},
        content_type="application/json",
    )

    newest = client.get(f"/api/v1/tasks/{task.pk}/activity").json()["items"][0]
    assert newest["kind"] == "status_changed"
    assert newest["data"] == {
        "old": "open",
        "new": "blocked",
        "blocked_reason": "Waiting on review",
        "via_parent": None,
        "via_subtask": None,
        "closed_subtasks": 0,
    }


@pytest.mark.django_db
def test_closing_records_the_status_change(client: Client, ada: User) -> None:
    task = services.create_task(services.inbox(ada), "Ship the release")

    client.patch(
        f"/api/v1/tasks/{task.pk}",
        {"status": "wont_do"},
        content_type="application/json",
    )

    newest = client.get(f"/api/v1/tasks/{task.pk}/activity").json()["items"][0]
    assert newest["kind"] == "status_changed"
    assert newest["data"] == {
        "old": "open",
        "new": "wont_do",
        "blocked_reason": "",
        "via_parent": None,
        "via_subtask": None,
        "closed_subtasks": 0,
    }


@pytest.mark.django_db
def test_changing_the_priority_records_the_old_and_new_priority(
    client: Client,
    ada: User,
) -> None:
    task = services.create_task(services.inbox(ada), "Ship the release")

    client.patch(f"/api/v1/tasks/{task.pk}", {"priority": 2}, content_type="application/json")
    client.patch(f"/api/v1/tasks/{task.pk}", {"priority": 2}, content_type="application/json")

    response = client.get(f"/api/v1/tasks/{task.pk}/activity")
    assert _kinds(response) == ["priority_changed", "created"]
    assert response.json()["items"][0]["data"] == {"old": 0, "new": 2}


@pytest.mark.django_db
def test_pinning_and_unpinning_are_recorded_once_each(client: Client, ada: User) -> None:
    task = services.create_task(services.inbox(ada), "Pay rent")

    for pinned in (True, True, False):
        client.patch(
            f"/api/v1/tasks/{task.pk}",
            {"pinned": pinned},
            content_type="application/json",
        )

    response = client.get(f"/api/v1/tasks/{task.pk}/activity")
    assert _kinds(response) == ["unpinned", "pinned", "created"]
    assert response.json()["items"][0]["data"] == {}


@pytest.mark.django_db
def test_a_duplicate_starts_its_own_history_with_created(client: Client, ada: User) -> None:
    original = services.create_task(services.inbox(ada), "Plan the trip")
    services.update_task(ada, original.pk, services.TaskEdit(title="Plan the holiday"))

    copy = client.post(f"/api/v1/tasks/{original.pk}/duplicate").json()

    assert _kinds(client.get(f"/api/v1/tasks/{copy['id']}/activity")) == ["created"]
