"""Tests for moving a Task to another Project through the Task endpoints."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from apps.tasks import projects, services
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
    services.create_task(work, "Already there")
    task = services.create_task(services.inbox(ada), "Plan launch")

    response = _patch(client, task.pk, {"project_id": work.pk})

    assert response.status_code == 200
    assert response.json()["task"]["project_id"] == work.pk
    assert [t.title for t in services.open_tasks(work)] == ["Plan launch", "Already there"]
    assert not services.open_tasks(services.inbox(ada)).exists()


@pytest.mark.django_db
def test_moving_a_task_is_logged_with_both_project_names(client: Client, ada: User) -> None:
    work = projects.create_project(ada, "Work")
    task = services.create_task(services.inbox(ada), "Plan launch")

    _patch(client, task.pk, {"project_id": work.pk})

    newest = client.get(f"/api/v1/tasks/{task.pk}/activity").json()["items"][0]
    assert newest["kind"] == "moved"
    assert newest["data"] == {"from_project": "Inbox", "to_project": "Work"}


@pytest.mark.django_db
def test_patch_to_the_same_project_logs_nothing(client: Client, ada: User) -> None:
    task = services.create_task(services.inbox(ada), "Plan launch")

    _patch(client, task.pk, {"project_id": services.inbox(ada).pk})

    assert [event.kind for event in task.activity.all()] == ["created"]


@pytest.mark.django_db
def test_patch_into_another_users_project_is_not_found(
    client: Client,
    ada: User,
    grace: User,
) -> None:
    task = services.create_task(services.inbox(ada), "Plan launch")

    response = _patch(client, task.pk, {"project_id": services.inbox(grace).pk})

    assert response.status_code == 404
    assert response.json() == {"detail": "Project not found."}
    task.refresh_from_db()
    assert task.project_id == services.inbox(ada).pk


@pytest.mark.django_db
def test_patch_into_a_trashed_project_is_not_found(client: Client, ada: User) -> None:
    trashed = projects.create_project(ada, "Old")
    Project.objects.filter(pk=trashed.pk).update(deleted_at="2026-01-01T00:00Z")
    task = services.create_task(services.inbox(ada), "Plan launch")

    response = _patch(client, task.pk, {"project_id": trashed.pk})

    assert response.status_code == 404
