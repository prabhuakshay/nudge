"""Tests for deleting Projects in Trash for good: Delete forever, Empty Trash and the purge."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

import pytest

from apps.tasks import project_trash, projects, purge, services, trash
from apps.tasks.models import Project, Task

if TYPE_CHECKING:
    from collections.abc import Callable

    from django.test import Client
    from django.test.client import _MonkeyPatchedWSGIResponse as Response

    from apps.accounts.models import User


def _trashed_project(user: User, name: str, *titles: str) -> Project:
    project = projects.create_project(user, name)
    for title in titles:
        services.create_task(project, title)
    project_trash.trash_project(user, project.pk)
    return project


def _delete_forever(
    client: Client,
    *,
    tasks: tuple[Task, ...] = (),
    projects: tuple[Project, ...] = (),
) -> Response:
    body = {"task_ids": [task.pk for task in tasks], "project_ids": [p.pk for p in projects]}
    return client.post("/api/v1/trash/delete", body, content_type="application/json")


def _exists(item: Task | Project) -> bool:
    return type(item).objects.filter(pk=item.pk).exists()


@pytest.mark.django_db
def test_delete_forever_removes_a_project_and_its_tasks(client: Client, ada: User) -> None:
    home = _trashed_project(ada, "Home", "Fix the tap")
    tap = Task.objects.get(title="Fix the tap")

    response = _delete_forever(client, projects=(home,))

    assert response.status_code == 204
    assert (_exists(home), _exists(tap)) == (False, False)
    assert client.get("/api/v1/trash").json() == []


@pytest.mark.django_db
def test_a_task_trashed_before_its_project_outlives_it_in_the_inbox(
    client: Client,
    ada: User,
) -> None:
    home = projects.create_project(ada, "Home")
    fence = services.create_task(home, "Paint the fence")
    trash.trash_task(ada, fence.pk)
    project_trash.trash_project(ada, home.pk)
    services.create_task(services.inbox(ada), "Buy milk")

    assert _delete_forever(client, projects=(home,)).status_code == 204

    [row] = client.get("/api/v1/trash").json()
    assert (row["title"], row["project_name"]) == ("Paint the fence", "Inbox")
    response = client.post(f"/api/v1/tasks/{fence.pk}/restore")
    assert response.json()["project"]["name"] == "Inbox"
    items = client.get(f"/api/v1/tasks?project={services.inbox(ada).pk}").json()["items"]
    assert [item["title"] for item in items] == ["Buy milk", "Paint the fence"]


@pytest.mark.django_db
def test_a_task_deleted_with_its_project_cannot_be_deleted_forever_alone(
    client: Client,
    ada: User,
) -> None:
    _trashed_project(ada, "Home", "Fix the tap")
    tap = Task.objects.get(title="Fix the tap")

    response = _delete_forever(client, tasks=(tap,))

    assert response.status_code == 404
    assert _exists(tap)


@pytest.mark.django_db
def test_delete_forever_of_another_users_project_is_not_found(
    client: Client,
    grace: User,
) -> None:
    theirs = _trashed_project(grace, "Grace's")

    response = _delete_forever(client, projects=(theirs,))

    assert response.status_code == 404
    assert _exists(theirs)


@pytest.mark.django_db
def test_delete_forever_of_a_live_project_is_not_found(client: Client, ada: User) -> None:
    live = projects.create_project(ada, "Home")

    assert _delete_forever(client, projects=(live,)).status_code == 404
    assert _exists(live)


@pytest.mark.django_db
def test_empty_trash_deletes_projects_too_even_without_tasks(client: Client, ada: User) -> None:
    empty = _trashed_project(ada, "Empty")
    home = _trashed_project(ada, "Home", "Fix the tap")

    assert client.delete("/api/v1/trash").status_code == 204

    assert (_exists(empty), _exists(home)) == (False, False)


@pytest.mark.django_db
def test_the_purge_deletes_expired_projects_even_without_tasks(
    ada: User,
    freeze_time: Callable[[datetime], None],
) -> None:
    deleted = datetime(2025, 3, 1, 9, 0, tzinfo=UTC)
    freeze_time(deleted)
    expired = _trashed_project(ada, "Empty")
    freeze_time(deleted + timedelta(days=200))
    kept = _trashed_project(ada, "Home")
    freeze_time(deleted + timedelta(days=365))

    assert purge.purge_expired_trash() == 1

    assert (_exists(expired), _exists(kept)) == (False, True)
