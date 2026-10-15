"""Tests for the Comment endpoints: list, add, edit and delete a Task's Comments."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

import pytest
from django.test import Client
from django.utils import timezone

from apps.tasks import people, projects, services

if TYPE_CHECKING:
    from collections.abc import Callable

    from django.test.client import _MonkeyPatchedWSGIResponse as Response

    from apps.accounts.models import User
    from apps.tasks.models import Person, Task

NOON = datetime(2026, 10, 15, 12, 0, tzinfo=UTC)


@pytest.fixture
def task(ada: User) -> Task:
    return services.create_task(services.inbox(ada), "Plan the trip")


def _post(client: Client, path: str, data: object) -> Response:
    return client.post(path, data, content_type="application/json")


def _patch(client: Client, path: str, data: object) -> Response:
    return client.patch(path, data, content_type="application/json")


def _comment(client: Client, task: Task, body: str) -> int:
    response = _post(client, f"/api/v1/tasks/{task.pk}/comments", {"body": body})
    assert response.status_code == 201
    comment_id: int = response.json()["id"]
    return comment_id


def _bodies(client: Client, task: Task) -> list[str]:
    response = client.get(f"/api/v1/tasks/{task.pk}/comments")
    assert response.status_code == 200
    return [comment["body"] for comment in response.json()]


def _mention(person: Person) -> str:
    return f"[@{person.name}](person:{person.pk})"


def _person_view(client: Client, person: Person) -> list[str]:
    response = client.get("/api/v1/tasks", {"person": str(person.pk)})
    assert response.status_code == 200
    return [task["title"] for task in response.json()["items"]]


def _activity_kinds(client: Client, task: Task) -> list[str]:
    response = client.get(f"/api/v1/tasks/{task.pk}/activity")
    assert response.status_code == 200
    return [event["kind"] for event in response.json()["items"]]


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("get", "/api/v1/tasks/1/comments"),
        ("post", "/api/v1/tasks/1/comments"),
        ("patch", "/api/v1/comments/1"),
        ("delete", "/api/v1/comments/1"),
    ],
)
def test_every_comment_endpoint_requires_a_session(method: str, path: str) -> None:
    response = getattr(Client(), method)(path)

    assert response.status_code == 401


@pytest.mark.django_db
def test_a_comment_is_added_and_listed_oldest_first(
    client: Client,
    task: Task,
    freeze_time: Callable[[datetime], None],
) -> None:
    freeze_time(NOON)
    _comment(client, task, "Booked the **train**")
    freeze_time(NOON + timedelta(minutes=5))

    response = _post(client, f"/api/v1/tasks/{task.pk}/comments", {"body": "  And the hotel  "})

    assert response.status_code == 201
    assert response.json()["body"] == "And the hotel"
    assert response.json()["created_at"] == response.json()["updated_at"]
    assert _bodies(client, task) == ["Booked the **train**", "And the hotel"]


@pytest.mark.django_db
@pytest.mark.parametrize("body", ["", "   ", "x" * 10_001])
def test_a_comment_body_must_hold_between_1_and_10000_characters(
    client: Client,
    task: Task,
    body: str,
) -> None:
    response = _post(client, f"/api/v1/tasks/{task.pk}/comments", {"body": body})

    assert response.status_code == 422
    assert _bodies(client, task) == []


@pytest.mark.django_db
def test_a_comment_of_10000_characters_is_accepted(client: Client, task: Task) -> None:
    response = _post(client, f"/api/v1/tasks/{task.pk}/comments", {"body": "x" * 10_000})

    assert response.status_code == 201


@pytest.mark.django_db
def test_editing_a_comment_changes_its_body_and_marks_it_edited(
    client: Client,
    task: Task,
    freeze_time: Callable[[datetime], None],
) -> None:
    freeze_time(NOON)
    comment_id = _comment(client, task, "Booked the train")
    freeze_time(NOON + timedelta(minutes=5))

    response = _patch(client, f"/api/v1/comments/{comment_id}", {"body": "Booked the plane"})

    assert response.status_code == 200
    assert response.json()["body"] == "Booked the plane"
    assert response.json()["created_at"] != response.json()["updated_at"]
    assert _bodies(client, task) == ["Booked the plane"]


@pytest.mark.django_db
def test_deleting_a_comment_removes_it_for_good(client: Client, task: Task) -> None:
    comment_id = _comment(client, task, "Booked the train")

    response = client.delete(f"/api/v1/comments/{comment_id}")

    assert response.status_code == 204
    assert _bodies(client, task) == []
    assert client.delete(f"/api/v1/comments/{comment_id}").status_code == 404


@pytest.mark.django_db
def test_a_mention_in_a_comment_puts_the_task_in_the_person_view(
    client: Client,
    ada: User,
    task: Task,
) -> None:
    priya = people.create_person(ada, "Priya")

    comment_id = _comment(client, task, f"Ask {_mention(priya)}")

    assert _person_view(client, priya) == ["Plan the trip"]
    _patch(client, f"/api/v1/comments/{comment_id}", {"body": "Never mind"})
    assert _person_view(client, priya) == []
    _patch(client, f"/api/v1/comments/{comment_id}", {"body": f"Ask {_mention(priya)}"})
    client.delete(f"/api/v1/comments/{comment_id}")
    assert _person_view(client, priya) == []


@pytest.mark.django_db
def test_editing_the_task_keeps_the_mentions_its_comments_hold(
    client: Client,
    ada: User,
    task: Task,
) -> None:
    priya = people.create_person(ada, "Priya")
    _comment(client, task, f"Ask {_mention(priya)}")

    _patch(client, f"/api/v1/tasks/{task.pk}", {"title": "Plan the holiday"})

    assert _person_view(client, priya) == ["Plan the holiday"]


@pytest.mark.django_db
def test_a_mention_of_another_users_person_is_refused(
    client: Client,
    grace: User,
    task: Task,
) -> None:
    theirs = people.create_person(grace, "Priya")
    comment_id = _comment(client, task, "Booked the train")

    posted = _post(client, f"/api/v1/tasks/{task.pk}/comments", {"body": _mention(theirs)})
    patched = _patch(client, f"/api/v1/comments/{comment_id}", {"body": _mention(theirs)})

    assert posted.status_code == 422
    assert patched.status_code == 422
    assert _bodies(client, task) == ["Booked the train"]


@pytest.mark.django_db
def test_renaming_or_deleting_a_person_rewrites_their_mentions_in_comments(
    client: Client,
    ada: User,
    task: Task,
) -> None:
    priya = people.create_person(ada, "Priya")
    _comment(client, task, f"Ask {_mention(priya)}")

    people.update_person(ada, priya.pk, name="Priya K")
    renamed = _bodies(client, task)
    people.delete_person(ada, priya.pk)

    assert renamed == [f"Ask [@Priya K](person:{priya.pk})"]
    assert _bodies(client, task) == ["Ask @Priya K"]


@pytest.mark.django_db
def test_merging_a_person_rewrites_their_mentions_in_comments(
    client: Client,
    ada: User,
    task: Task,
) -> None:
    priya, sam = people.create_person(ada, "Priya"), people.create_person(ada, "Sam")
    _comment(client, task, f"Ask {_mention(priya)}")

    people.merge_person(ada, priya.pk, sam.pk)

    assert _bodies(client, task) == [f"Ask {_mention(sam)}"]
    assert _person_view(client, sam) == ["Plan the trip"]


@pytest.mark.django_db
def test_comment_changes_are_not_logged_in_activity(client: Client, task: Task) -> None:
    comment_id = _comment(client, task, "Booked the train")
    _patch(client, f"/api/v1/comments/{comment_id}", {"body": "Booked the plane"})
    client.delete(f"/api/v1/comments/{comment_id}")

    assert _activity_kinds(client, task) == ["created"]


@pytest.mark.django_db
def test_list_rows_count_a_tasks_comments(client: Client, ada: User, task: Task) -> None:
    _comment(client, task, "Booked the train")
    _comment(client, task, "And the hotel")

    rows = client.get(f"/api/v1/tasks?project={services.inbox(ada).pk}").json()["items"]
    detail = client.get(f"/api/v1/tasks/{task.pk}").json()

    assert [row["comment_count"] for row in rows] == [2]
    assert detail["comment_count"] == 2


@pytest.mark.django_db
def test_a_task_in_an_archived_project_takes_no_comment_changes(
    client: Client,
    ada: User,
) -> None:
    project = projects.create_project(ada, "Trips")
    task = services.create_task(project, "Plan the trip")
    comment_id = _comment(client, task, "Booked the train")
    projects.archive_project(ada, project.pk)

    posted = _post(client, f"/api/v1/tasks/{task.pk}/comments", {"body": "And the hotel"})
    patched = _patch(client, f"/api/v1/comments/{comment_id}", {"body": "Booked the plane"})
    deleted = client.delete(f"/api/v1/comments/{comment_id}")

    assert [posted.status_code, patched.status_code, deleted.status_code] == [422, 422, 422]
    assert _bodies(client, task) == ["Booked the train"]


@pytest.mark.django_db
def test_a_trashed_tasks_comments_are_out_of_reach(client: Client, task: Task) -> None:
    comment_id = _comment(client, task, "Booked the train")
    task.deleted_at = timezone.now()
    task.save()

    listed = client.get(f"/api/v1/tasks/{task.pk}/comments")
    posted = _post(client, f"/api/v1/tasks/{task.pk}/comments", {"body": "And the hotel"})
    patched = _patch(client, f"/api/v1/comments/{comment_id}", {"body": "Booked the plane"})

    assert [listed.status_code, posted.status_code, patched.status_code] == [404, 404, 404]


@pytest.mark.django_db
def test_another_users_task_and_comments_are_404(client: Client, grace: User) -> None:
    theirs = services.create_task(services.inbox(grace), "Their task")
    grace_client = Client()
    grace_client.force_login(grace)
    comment_id = _comment(grace_client, theirs, "Their comment")

    listed = client.get(f"/api/v1/tasks/{theirs.pk}/comments")
    posted = _post(client, f"/api/v1/tasks/{theirs.pk}/comments", {"body": "Mine"})
    patched = _patch(client, f"/api/v1/comments/{comment_id}", {"body": "Mine"})
    deleted = client.delete(f"/api/v1/comments/{comment_id}")

    assert [r.status_code for r in (listed, posted, patched, deleted)] == [404, 404, 404, 404]
    assert _bodies(grace_client, theirs) == ["Their comment"]
