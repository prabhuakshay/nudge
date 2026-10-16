"""Tests for the Section a Task is in: moving it between Sections, out of them, and copying it."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from apps.tasks import creation, projects, sections, services

if TYPE_CHECKING:
    from django.test import Client
    from django.test.client import _MonkeyPatchedWSGIResponse as Response

    from apps.accounts.models import User
    from apps.tasks.models import Task


def _move(client: Client, task: Task, **destination: int | None) -> Response:
    return client.post(
        f"/api/v1/tasks/{task.pk}/move",
        destination,
        content_type="application/json",
    )


@pytest.mark.django_db
def test_a_root_moves_into_a_section_of_its_project(client: Client, ada: User) -> None:
    work = projects.create_project(ada, "Work")
    kitchen = sections.create_section(work, "Kitchen")
    task = creation.create_task(work, "Tile the wall")

    response = _move(client, task, section_id=kitchen.pk)

    assert response.status_code == 200, response.json()
    assert response.json()["task"]["section_id"] == kitchen.pk


def _in_section(project_name: str, ada: User) -> tuple[Task, int]:
    """Create a root Task in a Section of a new Project; return it and the Section's id."""
    project = projects.create_project(ada, project_name)
    section = sections.create_section(project, "Kitchen")
    task = creation.create_task(project, "Tile the wall", creation.NewTask(section=section))
    return task, section.pk


def _section_id(client: Client, task: Task) -> int | None:
    section_id: int | None = client.get(f"/api/v1/tasks/{task.pk}").json()["section_id"]
    return section_id


@pytest.mark.django_db
def test_a_move_to_another_project_or_the_inbox_clears_the_section(
    client: Client,
    ada: User,
) -> None:
    to_project, _ = _in_section("Work", ada)
    to_inbox, _ = _in_section("Home", ada)
    garden = projects.create_project(ada, "Garden")

    _move(client, to_project, project_id=garden.pk)
    _move(client, to_inbox, project_id=services.inbox(ada).pk)

    assert _section_id(client, to_project) is None
    assert _section_id(client, to_inbox) is None


@pytest.mark.django_db
def test_a_root_that_becomes_a_subtask_leaves_its_section(client: Client, ada: User) -> None:
    task, _ = _in_section("Work", ada)
    parent = creation.create_task(task.project, "Renovate")

    response = _move(client, task, parent_id=parent.pk)

    assert response.status_code == 200, response.json()
    assert _section_id(client, task) is None


@pytest.mark.django_db
def test_a_section_in_another_project_than_the_destination_is_refused(
    client: Client,
    ada: User,
) -> None:
    task, kitchen = _in_section("Work", ada)
    home = projects.create_project(ada, "Home")
    elsewhere = sections.create_section(home, "Garden")

    staying = _move(client, task, section_id=elsewhere.pk)
    leaving = _move(client, task, project_id=services.inbox(ada).pk, section_id=kitchen)

    refused = {"detail": "That Section is in another Project."}
    assert (staying.status_code, staying.json()) == (422, refused)
    assert (leaving.status_code, leaving.json()) == (422, refused)
    assert _section_id(client, task) == kitchen


@pytest.mark.django_db
def test_a_subtask_cannot_be_given_a_section(client: Client, ada: User) -> None:
    task, kitchen = _in_section("Work", ada)
    parent = creation.create_task(task.project, "Renovate")

    response = _move(client, task, parent_id=parent.pk, section_id=kitchen)

    assert response.status_code == 422
    assert response.json() == {"detail": "A Subtask follows its root Task's Section."}
    assert _section_id(client, task) == kitchen


@pytest.mark.django_db
def test_a_reorder_that_leaves_out_the_section_keeps_it(client: Client, ada: User) -> None:
    task, kitchen = _in_section("Work", ada)
    other = creation.create_task(task.project, "Paint")

    _move(client, task, after_id=other.pk)

    assert _section_id(client, task) == kitchen


@pytest.mark.django_db
def test_a_null_section_moves_the_task_to_no_section(client: Client, ada: User) -> None:
    task, _ = _in_section("Work", ada)

    response = _move(client, task, section_id=None)

    assert response.status_code == 200, response.json()
    assert _section_id(client, task) is None


@pytest.mark.django_db
def test_another_users_section_is_not_found(client: Client, ada: User, grace: User) -> None:
    task, kitchen = _in_section("Work", ada)
    theirs = sections.create_section(projects.create_project(grace, "Work"), "Kitchen")

    response = _move(client, task, section_id=theirs.pk)

    assert response.status_code == 404
    assert response.json() == {"detail": "Section not found."}
    assert _section_id(client, task) == kitchen


@pytest.mark.django_db
def test_a_section_change_is_logged_with_both_section_names(client: Client, ada: User) -> None:
    task, _ = _in_section("Work", ada)
    bathroom = sections.create_section(task.project, "Bathroom")

    _move(client, task, section_id=bathroom.pk)

    newest = client.get(f"/api/v1/tasks/{task.pk}/activity").json()["items"][0]
    assert newest["kind"] == "moved"
    assert newest["data"] == {
        "from_project": "Work",
        "to_project": "Work",
        "from_parent": None,
        "to_parent": None,
        "from_section": "Kitchen",
        "to_section": "Bathroom",
    }


@pytest.mark.django_db
def test_changing_the_project_in_an_edit_clears_the_section(client: Client, ada: User) -> None:
    task, _ = _in_section("Work", ada)

    client.patch(
        f"/api/v1/tasks/{task.pk}",
        {"project_id": services.inbox(ada).pk},
        content_type="application/json",
    )

    assert _section_id(client, task) is None
    newest = client.get(f"/api/v1/tasks/{task.pk}/activity").json()["items"][0]
    assert (newest["data"]["from_section"], newest["data"]["to_section"]) == ("Kitchen", None)


@pytest.mark.django_db
def test_a_duplicate_keeps_the_section(client: Client, ada: User) -> None:
    task, kitchen = _in_section("Work", ada)

    copy = client.post(f"/api/v1/tasks/{task.pk}/duplicate").json()

    assert copy["section_id"] == kitchen
