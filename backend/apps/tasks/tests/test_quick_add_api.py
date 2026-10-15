"""Tests for what Quick add sends with a new Task or Subtask: Priority, Tags, dates, Repeat."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from apps.tasks import services, tags

if TYPE_CHECKING:
    from django.test import Client
    from django.test.client import _MonkeyPatchedWSGIResponse as Response

    from apps.accounts.models import User


def _post(client: Client, data: object) -> Response:
    return client.post("/api/v1/tasks", data, content_type="application/json")


@pytest.mark.django_db
def test_create_sets_the_priority(client: Client, ada: User) -> None:
    response = _post(client, {"title": "Pay rent", "priority": 1})

    assert response.status_code == 201
    assert response.json()["priority"] == 1
    assert ada.tasks.get().priority == 1


@pytest.mark.django_db
def test_create_has_no_priority_by_default(client: Client) -> None:
    response = _post(client, {"title": "Pay rent"})

    assert response.json()["priority"] == 0


@pytest.mark.django_db
def test_create_refuses_an_unknown_priority(client: Client, ada: User) -> None:
    response = _post(client, {"title": "Pay rent", "priority": 5})

    assert response.status_code == 422
    assert not ada.tasks.exists()


@pytest.mark.django_db
def test_a_subtask_gets_its_priority_and_tags(client: Client, ada: User) -> None:
    parent = services.create_task(services.inbox(ada), "Plan the trip")
    work = tags.create_tag(ada, "work")

    response = _post(
        client,
        {
            "title": "Book flights",
            "parent_id": parent.pk,
            "priority": 2,
            "tags": ["travel"],
            "tag_ids": [work.pk],
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert body["priority"] == 2
    assert sorted(tag["name"] for tag in body["tags"]) == ["travel", "work"]
    assert ada.tags.filter(name="travel").exists()


@pytest.mark.django_db
def test_a_subtask_cannot_use_another_users_tag(
    client: Client,
    ada: User,
    grace: User,
) -> None:
    parent = services.create_task(services.inbox(ada), "Plan the trip")
    graces = tags.create_tag(grace, "hers")

    response = _post(
        client,
        {"title": "Book flights", "parent_id": parent.pk, "tag_ids": [graces.pk]},
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Tag not found."}
    assert parent.subtasks.count() == 0


@pytest.mark.django_db
def test_create_sets_a_repeat(client: Client, ada: User) -> None:
    response = _post(
        client,
        {
            "title": "Water the plants",
            "dates": {"due_date": "2026-10-19", "due_time": "09:00"},
            "repeat_rule": "FREQ=WEEKLY;BYDAY=MO",
            "repeat_from": "completion",
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert body["repeat_rule"] == "FREQ=WEEKLY;BYDAY=MO"
    assert body["repeat_from"] == "completion"
    assert str(ada.tasks.get().repeat_anchor) == "2026-10-19"


@pytest.mark.django_db
def test_create_refuses_a_repeat_without_a_due_date(client: Client, ada: User) -> None:
    response = _post(client, {"title": "Water the plants", "repeat_rule": "FREQ=DAILY"})

    assert response.status_code == 422
    assert response.json() == {"detail": "A repeating task needs a due date."}
    assert not ada.tasks.exists()


@pytest.mark.django_db
def test_create_refuses_an_unreadable_repeat(client: Client, ada: User) -> None:
    response = _post(
        client,
        {"title": "Water", "dates": {"due_date": "2026-10-19"}, "repeat_rule": "FREQ=SOMETIMES"},
    )

    assert response.status_code == 422
    assert not ada.tasks.exists()


@pytest.mark.django_db
def test_a_subtask_gets_its_dates(client: Client, ada: User) -> None:
    parent = services.create_task(services.inbox(ada), "Plan the trip")

    response = _post(
        client,
        {"title": "Book flights", "parent_id": parent.pk, "dates": {"due_date": "2026-10-20"}},
    )

    assert response.status_code == 201
    assert response.json()["due_date"] == "2026-10-20"


@pytest.mark.django_db
def test_a_subtask_cannot_repeat(client: Client, ada: User) -> None:
    parent = services.create_task(services.inbox(ada), "Plan the trip")

    response = _post(
        client,
        {
            "title": "Book flights",
            "parent_id": parent.pk,
            "dates": {"due_date": "2026-10-20"},
            "repeat_rule": "FREQ=DAILY",
        },
    )

    assert response.status_code == 422
    assert response.json() == {"detail": "Only a top-level task can repeat."}
    assert parent.subtasks.count() == 0
