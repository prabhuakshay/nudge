"""Tests for where a Task restored from Trash goes back to."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from django.utils import timezone

from apps.tasks import creation, projects, sections, services
from apps.tasks.models import Project, Task

if TYPE_CHECKING:
    from django.test import Client
    from django.test.client import _MonkeyPatchedWSGIResponse as Response

    from apps.accounts.models import User


def _delete(client: Client, task: Task) -> Response:
    return client.delete(f"/api/v1/tasks/{task.pk}")


def _restore(client: Client, task: Task) -> Response:
    return client.post(f"/api/v1/tasks/{task.pk}/restore")


def _set_status(client: Client, task: Task, status: str) -> None:
    client.patch(f"/api/v1/tasks/{task.pk}", {"status": status}, content_type="application/json")


def _inbox_titles(client: Client, user: User, *, roots: bool = False) -> list[str]:
    response = client.get(f"/api/v1/tasks?project={services.inbox(user).pk}")
    items = response.json()["items"]
    return [item["title"] for item in items if not roots or item["parent_id"] is None]


def _subtask(parent: Task, title: str) -> Task:
    return creation.create_subtask(parent, title).task


def _trash(client: Client) -> list[dict[str, object]]:
    response = client.get("/api/v1/trash")
    assert response.status_code == 200
    rows: list[dict[str, object]] = response.json()
    return rows


@pytest.mark.django_db
def test_restoring_a_task_puts_it_back_where_it_was(client: Client, ada: User) -> None:
    inbox = services.inbox(ada)
    for title in ("Last", "Middle", "First"):
        creation.create_task(inbox, title)
    middle = Task.objects.get(title="Middle")
    _subtask(middle, "Step")
    _delete(client, middle)

    response = _restore(client, middle)

    assert response.status_code == 200
    assert response.json()["task"]["title"] == "Middle"
    assert response.json()["project"]["name"] == "Inbox"
    assert _inbox_titles(client, ada, roots=True) == ["First", "Middle", "Last"]
    assert "Step" in _inbox_titles(client, ada)
    assert _trash(client) == []


@pytest.mark.django_db
def test_restoring_a_subtask_by_its_id_brings_back_its_whole_unit(
    client: Client,
    ada: User,
) -> None:
    task = creation.create_task(services.inbox(ada), "Move house")
    pack = _subtask(task, "Pack")
    _delete(client, task)

    response = _restore(client, pack)

    assert response.json()["task"]["id"] == task.pk
    assert _inbox_titles(client, ada) == ["Move house", "Pack"]


@pytest.mark.django_db
def test_a_restored_subtask_goes_back_under_its_live_parent(client: Client, ada: User) -> None:
    task = creation.create_task(services.inbox(ada), "Move house")
    pack = _subtask(task, "Pack")
    _subtask(task, "Clean")
    _delete(client, pack)

    _restore(client, pack)

    subtasks = client.get(f"/api/v1/tasks/{task.pk}").json()["subtasks"]
    assert [subtask["title"] for subtask in subtasks] == ["Pack", "Clean"]


@pytest.mark.django_db
def test_a_subtask_whose_parent_is_in_trash_comes_back_last_at_the_top_level(
    client: Client,
    ada: User,
) -> None:
    inbox = services.inbox(ada)
    task = creation.create_task(inbox, "Move house")
    pack = _subtask(task, "Pack")
    _subtask(pack, "Pack books")
    creation.create_task(inbox, "Pay rent")
    _delete(client, pack)
    _delete(client, task)

    response = _restore(client, pack)

    assert response.json()["task"]["parent_id"] is None
    assert _inbox_titles(client, ada, roots=True) == ["Pay rent", "Pack"]
    assert "Pack books" in _inbox_titles(client, ada)
    assert [row["title"] for row in _trash(client)] == ["Move house"]


@pytest.mark.django_db
def test_a_subtask_that_no_longer_fits_under_its_parent_comes_back_at_the_top_level(
    client: Client,
    ada: User,
) -> None:
    inbox = services.inbox(ada)
    task = creation.create_task(inbox, "Move house")
    pack = _subtask(task, "Pack")
    _subtask(pack, "Pack books")
    _delete(client, pack)
    deep = _subtask(creation.create_task(inbox, "Plan"), "Book a van")
    client.post(
        f"/api/v1/tasks/{task.pk}/move",
        {"parent_id": deep.pk},
        content_type="application/json",
    )

    response = _restore(client, pack)

    assert response.json()["task"]["parent_id"] is None


@pytest.mark.django_db
def test_a_task_whose_project_is_in_trash_comes_back_to_the_inbox(
    client: Client,
    ada: User,
) -> None:
    project = projects.create_project(ada, "Home")
    task = creation.create_task(project, "Move house")
    step = _subtask(task, "Pack")
    _delete(client, task)
    Project.objects.filter(pk=project.pk).update(deleted_at=timezone.now())

    response = _restore(client, task)

    inbox = services.inbox(ada)
    assert response.json()["project"]["id"] == inbox.pk
    assert response.json()["task"]["project_id"] == inbox.pk
    assert _inbox_titles(client, ada) == ["Move house", "Pack"]
    assert Task.objects.get(pk=step.pk).project_id == inbox.pk


@pytest.mark.django_db
def test_a_task_comes_back_into_its_archived_project(client: Client, ada: User) -> None:
    project = projects.create_project(ada, "Home")
    task = creation.create_task(project, "Move house")
    _delete(client, task)
    projects.archive_project(ada, project.pk)

    response = _restore(client, task)

    assert response.json()["project"]["id"] == project.pk
    assert response.json()["project"]["is_archived"] is True


@pytest.mark.django_db
def test_restoring_under_a_closed_parent_reopens_it(client: Client, ada: User) -> None:
    task = creation.create_task(services.inbox(ada), "Move house")
    pack = _subtask(task, "Pack")
    _delete(client, pack)
    client.patch(
        f"/api/v1/tasks/{task.pk}",
        {"status": "completed"},
        content_type="application/json",
    )

    _restore(client, pack)

    assert client.get(f"/api/v1/tasks/{task.pk}").json()["status"] == "open"


@pytest.mark.django_db
def test_restoring_a_closed_subtask_leaves_its_closed_parent_closed(
    client: Client,
    ada: User,
) -> None:
    task = creation.create_task(services.inbox(ada), "Move house")
    pack = _subtask(task, "Pack")
    _set_status(client, pack, "completed")
    _delete(client, pack)
    _set_status(client, task, "completed")

    _restore(client, pack)

    assert client.get(f"/api/v1/tasks/{task.pk}").json()["status"] == "completed"


@pytest.mark.django_db
def test_a_task_whose_section_was_deleted_comes_back_in_no_section(
    client: Client, ada: User
) -> None:
    project = projects.create_project(ada, "Home")
    kitchen = sections.create_section(project, "Kitchen")
    task = creation.create_task(project, "Paint walls", creation.NewTask(section=kitchen))
    _delete(client, task)
    client.delete(f"/api/v1/sections/{kitchen.pk}")

    response = _restore(client, task)

    assert response.status_code == 200
    assert response.json()["task"]["project_id"] == project.pk
    assert response.json()["task"]["section_id"] is None


@pytest.mark.django_db
def test_a_task_that_comes_back_to_the_inbox_leaves_its_section(client: Client, ada: User) -> None:
    project = projects.create_project(ada, "Home")
    kitchen = sections.create_section(project, "Kitchen")
    task = creation.create_task(project, "Paint walls", creation.NewTask(section=kitchen))
    _delete(client, task)
    Project.objects.filter(pk=project.pk).update(deleted_at=timezone.now())

    response = _restore(client, task)

    assert response.json()["task"]["project_id"] == services.inbox(ada).pk
    assert response.json()["task"]["section_id"] is None
