"""Tests for moving a Task to another Project through the Task endpoints."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from apps.tasks import creation, projects, services
from apps.tasks.models import Project

if TYPE_CHECKING:
    from django.test import Client
    from django.test.client import _MonkeyPatchedWSGIResponse as Response

    from apps.accounts.models import User


def _patch(client: Client, task_id: int, data: object) -> Response:
    return client.patch(f"/api/v1/tasks/{task_id}", data, content_type="application/json")


@pytest.mark.django_db
def test_create_adds_the_task_to_the_given_project(client: Client, ada: User) -> None:
    work = projects.create_project(ada, "Work")

    response = client.post(
        "/api/v1/tasks",
        {"title": "Plan launch", "project_id": work.pk},
        content_type="application/json",
    )

    assert response.status_code == 201
    assert response.json()["project_id"] == work.pk


@pytest.mark.django_db
def test_patch_moves_a_task_first_into_another_project(client: Client, ada: User) -> None:
    work = projects.create_project(ada, "Work")
    creation.create_task(work, "Already there")
    task = creation.create_task(services.inbox(ada), "Plan launch")

    response = _patch(client, task.pk, {"project_id": work.pk})

    assert response.status_code == 200
    assert response.json()["task"]["project_id"] == work.pk
    assert [t.title for t in services.open_tasks(work)] == ["Plan launch", "Already there"]
    assert not services.open_tasks(services.inbox(ada)).exists()


@pytest.mark.django_db
def test_moving_a_task_is_logged_with_both_project_names(client: Client, ada: User) -> None:
    work = projects.create_project(ada, "Work")
    task = creation.create_task(services.inbox(ada), "Plan launch")

    _patch(client, task.pk, {"project_id": work.pk})

    newest = client.get(f"/api/v1/tasks/{task.pk}/activity").json()["items"][0]
    assert newest["kind"] == "moved"
    assert newest["data"] == {
        "from_project": "Inbox",
        "to_project": "Work",
        "from_parent": None,
        "to_parent": None,
        "from_section": None,
        "to_section": None,
    }


@pytest.mark.django_db
def test_patch_to_the_same_project_logs_nothing(client: Client, ada: User) -> None:
    task = creation.create_task(services.inbox(ada), "Plan launch")

    _patch(client, task.pk, {"project_id": services.inbox(ada).pk})

    assert [event.kind for event in task.activity.all()] == ["created"]


@pytest.mark.django_db
def test_patch_into_another_users_project_is_not_found(
    client: Client,
    ada: User,
    grace: User,
) -> None:
    task = creation.create_task(services.inbox(ada), "Plan launch")

    response = _patch(client, task.pk, {"project_id": services.inbox(grace).pk})

    assert response.status_code == 404
    assert response.json() == {"detail": "Project not found."}
    task.refresh_from_db()
    assert task.project_id == services.inbox(ada).pk


@pytest.mark.django_db
def test_patch_into_a_trashed_project_is_not_found(client: Client, ada: User) -> None:
    trashed = projects.create_project(ada, "Old")
    Project.objects.filter(pk=trashed.pk).update(deleted_at="2026-01-01T00:00Z")
    task = creation.create_task(services.inbox(ada), "Plan launch")

    response = _patch(client, task.pk, {"project_id": trashed.pk})

    assert response.status_code == 404


@pytest.mark.django_db
def test_moving_a_root_carries_its_subtasks(client: Client, ada: User) -> None:
    work = projects.create_project(ada, "Work")
    root = creation.create_task(services.inbox(ada), "Plan launch")
    child = creation.create_subtask(root, "Write notes").task
    creation.create_subtask(child, "Outline")

    _patch(client, root.pk, {"project_id": work.pk})

    rows = client.get(f"/api/v1/tasks?project={work.pk}").json()["items"]
    assert [(row["title"], row["depth"]) for row in rows] == [
        ("Plan launch", 0),
        ("Write notes", 1),
        ("Outline", 2),
    ]


@pytest.mark.django_db
def test_moving_a_subtask_makes_it_a_root_first_in_the_other_project(
    client: Client,
    ada: User,
) -> None:
    work = projects.create_project(ada, "Work")
    creation.create_task(work, "Already there")
    root = creation.create_task(services.inbox(ada), "Plan launch")
    child = creation.create_subtask(root, "Write notes").task
    creation.create_subtask(child, "Outline")

    response = _patch(client, child.pk, {"project_id": work.pk})

    assert response.json()["task"]["parent_id"] is None
    rows = client.get(f"/api/v1/tasks?project={work.pk}").json()["items"]
    assert [(row["title"], row["parent_title"]) for row in rows] == [
        ("Write notes", None),
        ("Already there", None),
        ("Outline", "Write notes"),
    ]
    assert [t.title for t in services.open_tasks(services.inbox(ada))] == ["Plan launch"]
