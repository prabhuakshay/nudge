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
        services.update_task(ada, task.pk, title=f"Title {number}")
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
