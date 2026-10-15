"""Tests for moving Tasks to Trash, listing the Trash, and who may do either."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import TYPE_CHECKING

import pytest
from django.test import Client
from django.utils import timezone

from apps.tasks import projects, services, tags
from apps.tasks.dates import TaskDates
from apps.tasks.models import Task

if TYPE_CHECKING:
    from django.test.client import _MonkeyPatchedWSGIResponse as Response
    from pytest_django import Settings

    from apps.accounts.models import User


def _delete(client: Client, task: Task) -> Response:
    return client.delete(f"/api/v1/tasks/{task.pk}")


def _restore(client: Client, task: Task) -> Response:
    return client.post(f"/api/v1/tasks/{task.pk}/restore")


def _inbox_titles(client: Client, user: User) -> list[str]:
    response = client.get(f"/api/v1/tasks?project={services.inbox(user).pk}")
    return [item["title"] for item in response.json()["items"]]


def _subtask(parent: Task, title: str) -> Task:
    return services.create_subtask(parent, title).task


def _trash(client: Client) -> list[dict[str, object]]:
    response = client.get("/api/v1/trash")
    assert response.status_code == 200
    rows: list[dict[str, object]] = response.json()
    return rows


def _expiry(row: dict[str, object]) -> timedelta:
    expires = datetime.fromisoformat(str(row["expires_at"]))
    return expires - datetime.fromisoformat(str(row["deleted_at"]))


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("method", "path"),
    [("delete", "/api/v1/tasks/1"), ("post", "/api/v1/tasks/1/restore"), ("get", "/api/v1/trash")],
)
def test_every_trash_endpoint_requires_a_session(method: str, path: str) -> None:
    response = getattr(Client(), method)(path)

    assert response.status_code == 401


@pytest.mark.django_db
def test_deleting_a_task_takes_it_out_of_its_list(client: Client, ada: User) -> None:
    task = services.create_task(services.inbox(ada), "Pay rent")
    services.create_task(services.inbox(ada), "Buy milk")

    response = _delete(client, task)

    assert response.status_code == 204
    assert _inbox_titles(client, ada) == ["Buy milk"]
    assert client.get(f"/api/v1/tasks/{task.pk}").status_code == 404


@pytest.mark.django_db
def test_a_deleted_task_takes_its_subtasks_to_trash_as_one_row(client: Client, ada: User) -> None:
    task = services.create_task(services.inbox(ada), "Move house")
    _subtask(_subtask(task, "Pack"), "Pack books")

    _delete(client, task)

    [row] = _trash(client)
    assert row["id"] == task.pk
    assert row["title"] == "Move house"
    assert row["project_name"] == "Inbox"
    assert row["subtask_count"] == 2
    assert _expiry(row) == timedelta(days=365)


@pytest.mark.django_db
def test_trash_keeps_deleted_tasks_for_the_configured_days(
    client: Client,
    ada: User,
    settings: Settings,
) -> None:
    settings.TRASH_RETENTION_DAYS = 30
    _delete(client, services.create_task(services.inbox(ada), "Pay rent"))

    [row] = _trash(client)

    assert _expiry(row) == timedelta(days=30)


@pytest.mark.django_db
def test_trash_lists_the_newest_delete_first(client: Client, ada: User) -> None:
    inbox = services.inbox(ada)
    for title in ("First", "Second"):
        _delete(client, services.create_task(inbox, title))

    assert [row["title"] for row in _trash(client)] == ["Second", "First"]


@pytest.mark.django_db
def test_a_subtask_deleted_alone_stays_its_own_unit(client: Client, ada: User) -> None:
    task = services.create_task(services.inbox(ada), "Move house")
    pack = _subtask(task, "Pack")
    _delete(client, pack)
    _delete(client, task)

    response = _restore(client, task)

    assert response.status_code == 200
    assert [row["title"] for row in _trash(client)] == ["Pack"]
    assert client.get(f"/api/v1/tasks/{task.pk}").json()["subtasks"] == []


@pytest.mark.django_db
def test_a_task_in_an_archived_project_cannot_be_deleted(client: Client, ada: User) -> None:
    project = projects.create_project(ada, "Home")
    task = services.create_task(project, "Move house")
    projects.archive_project(ada, project.pk)

    response = _delete(client, task)

    assert response.status_code == 422
    assert _trash(client) == []


@pytest.mark.django_db
def test_trash_and_restore_are_logged_in_activity(client: Client, ada: User) -> None:
    task = services.create_task(services.inbox(ada), "Move house")
    _delete(client, task)

    _restore(client, task)

    activity = client.get(f"/api/v1/tasks/{task.pk}/activity").json()["items"]
    assert [item["kind"] for item in activity] == ["restored", "trashed", "created"]


@pytest.mark.django_db
def test_a_trashed_task_leaves_the_views_and_counts(client: Client, ada: User) -> None:
    today = timezone.localdate()
    task = services.create_task(services.inbox(ada), "Pay rent", TaskDates(due_date=today))
    _subtask(task, "Find the bank details")
    money = tags.create_tag(ada, "money")
    client.patch(
        f"/api/v1/tasks/{task.pk}",
        {"tag_ids": [money.pk]},
        content_type="application/json",
    )

    _delete(client, task)

    assert client.get("/api/v1/tasks?view=today").json()["items"] == []
    assert client.get(f"/api/v1/tasks?tag={money.pk}").json()["items"] == []
    sidebar = client.get("/api/v1/sidebar").json()
    assert sidebar["today_count"] == 0
    assert sidebar["inbox"]["open_count"] == 0
    assert [(tag["open_count"], tag["task_count"]) for tag in sidebar["tags"]] == [(0, 0)]


@pytest.mark.django_db
def test_restoring_a_live_task_is_not_found(client: Client, ada: User) -> None:
    task = services.create_task(services.inbox(ada), "Pay rent")

    assert _restore(client, task).status_code == 404


@pytest.mark.django_db
def test_deleting_another_users_task_is_not_found(client: Client, grace: User) -> None:
    task = services.create_task(services.inbox(grace), "Grace's task")

    response = _delete(client, task)

    assert response.status_code == 404
    assert Task.objects.get(pk=task.pk).deleted_at is None


@pytest.mark.django_db
def test_restoring_another_users_task_is_not_found(client: Client, grace: User) -> None:
    task = services.create_task(services.inbox(grace), "Grace's task")
    graces = Client()
    graces.force_login(grace)
    _delete(graces, task)

    response = _restore(client, task)

    assert response.status_code == 404
    assert _trash(client) == []
    assert Task.objects.get(pk=task.pk).deleted_at is not None
