"""Tests for ordering the sidebar: moving Projects and Folders among their siblings."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from apps.tasks import projects, services

if TYPE_CHECKING:
    from django.test import Client
    from django.test.client import _MonkeyPatchedWSGIResponse as Response

    from apps.accounts.models import User


def _move(client: Client, path: str, data: object) -> Response:
    return client.post(path, data, content_type="application/json")


def _top_level(user: User) -> list[str]:
    """The sidebar's top level as `folder:<name>` and `project:<name>`, in order."""
    return [f"{type(item).__name__.lower()}:{item.name}" for item in projects.sidebar_items(user)]


@pytest.mark.django_db
def test_move_without_a_neighbour_puts_the_project_first(client: Client, ada: User) -> None:
    projects.create_project(ada, "Work")
    home = projects.create_project(ada, "Home")

    response = _move(client, f"/api/v1/projects/{home.pk}/move", {})

    assert response.status_code == 204
    assert _top_level(ada) == ["project:Home", "project:Work"]


@pytest.mark.django_db
def test_move_after_a_folder_mixes_projects_and_folders(client: Client, ada: User) -> None:
    work = projects.create_project(ada, "Work")
    folder = projects.create_folder(ada, "Personal")
    projects.create_project(ada, "Home")

    response = _move(
        client,
        f"/api/v1/projects/{work.pk}/move",
        {"after": {"kind": "folder", "id": folder.pk}},
    )

    assert response.status_code == 204
    assert _top_level(ada) == ["folder:Personal", "project:Work", "project:Home"]


@pytest.mark.django_db
def test_move_into_a_folder_after_one_of_its_projects(client: Client, ada: User) -> None:
    folder = projects.create_folder(ada, "Personal")
    health = projects.create_project(ada, "Health", folder=folder)
    projects.create_project(ada, "Garden", folder=folder)
    home = projects.create_project(ada, "Home")

    response = _move(
        client,
        f"/api/v1/projects/{home.pk}/move",
        {"folder_id": folder.pk, "after": {"kind": "project", "id": health.pk}},
    )

    assert response.status_code == 204
    assert _top_level(ada) == ["folder:Personal"]
    assert [p.name for p in projects.folder_projects(folder)] == ["Health", "Home", "Garden"]


@pytest.mark.django_db
def test_move_out_of_a_folder_to_the_top_level(client: Client, ada: User) -> None:
    folder = projects.create_folder(ada, "Personal")
    health = projects.create_project(ada, "Health", folder=folder)

    response = _move(
        client,
        f"/api/v1/projects/{health.pk}/move",
        {"after": {"kind": "folder", "id": folder.pk}},
    )

    assert response.status_code == 204
    assert _top_level(ada) == ["folder:Personal", "project:Health"]


@pytest.mark.django_db
def test_move_after_a_stale_neighbour_puts_the_project_last(client: Client, ada: User) -> None:
    work = projects.create_project(ada, "Work")
    projects.create_project(ada, "Home")
    elsewhere = projects.create_folder(ada, "Personal")
    outside = projects.create_project(ada, "Health", folder=elsewhere)

    response = _move(
        client,
        f"/api/v1/projects/{work.pk}/move",
        {"after": {"kind": "project", "id": outside.pk}},
    )

    assert response.status_code == 204
    assert _top_level(ada) == ["project:Home", "folder:Personal", "project:Work"]


@pytest.mark.django_db
def test_move_after_itself_keeps_the_project_in_place(client: Client, ada: User) -> None:
    work = projects.create_project(ada, "Work")
    projects.create_project(ada, "Home")

    response = _move(
        client,
        f"/api/v1/projects/{work.pk}/move",
        {"after": {"kind": "project", "id": work.pk}},
    )

    assert response.status_code == 204
    assert _top_level(ada) == ["project:Work", "project:Home"]


@pytest.mark.django_db
def test_move_refuses_to_move_the_inbox(client: Client, ada: User) -> None:
    folder = projects.create_folder(ada, "Personal")

    response = _move(
        client,
        f"/api/v1/projects/{services.inbox(ada).pk}/move",
        {"folder_id": folder.pk},
    )

    assert response.status_code == 422
    assert not folder.projects.exists()


@pytest.mark.django_db
def test_move_another_users_project_is_not_found(client: Client, grace: User) -> None:
    project = projects.create_project(grace, "Theirs")

    response = _move(client, f"/api/v1/projects/{project.pk}/move", {})

    assert response.status_code == 404


@pytest.mark.django_db
def test_move_into_another_users_folder_is_not_found(
    client: Client,
    ada: User,
    grace: User,
) -> None:
    project = projects.create_project(ada, "Work")
    folder = projects.create_folder(grace, "Theirs")

    response = _move(client, f"/api/v1/projects/{project.pk}/move", {"folder_id": folder.pk})

    assert response.status_code == 404
    project.refresh_from_db()
    assert project.folder_id is None


@pytest.mark.django_db
def test_move_a_folder_after_a_project(client: Client, ada: User) -> None:
    folder = projects.create_folder(ada, "Personal")
    work = projects.create_project(ada, "Work")
    projects.create_project(ada, "Home")

    response = _move(
        client,
        f"/api/v1/folders/{folder.pk}/move",
        {"after": {"kind": "project", "id": work.pk}},
    )

    assert response.status_code == 204
    assert _top_level(ada) == ["project:Work", "folder:Personal", "project:Home"]


@pytest.mark.django_db
def test_move_a_folder_first(client: Client, ada: User) -> None:
    projects.create_project(ada, "Work")
    folder = projects.create_folder(ada, "Personal")

    response = _move(client, f"/api/v1/folders/{folder.pk}/move", {})

    assert response.status_code == 204
    assert _top_level(ada) == ["folder:Personal", "project:Work"]


@pytest.mark.django_db
def test_move_a_folder_after_a_project_inside_a_folder_puts_it_last(
    client: Client,
    ada: User,
) -> None:
    personal = projects.create_folder(ada, "Personal")
    health = projects.create_project(ada, "Health", folder=personal)
    work = projects.create_folder(ada, "Work")
    projects.create_project(ada, "Home")

    response = _move(
        client,
        f"/api/v1/folders/{work.pk}/move",
        {"after": {"kind": "project", "id": health.pk}},
    )

    assert response.status_code == 204
    assert _top_level(ada) == ["folder:Personal", "project:Home", "folder:Work"]


@pytest.mark.django_db
def test_move_another_users_folder_is_not_found(client: Client, grace: User) -> None:
    folder = projects.create_folder(grace, "Theirs")

    response = _move(client, f"/api/v1/folders/{folder.pk}/move", {})

    assert response.status_code == 404


@pytest.mark.django_db
def test_move_a_folder_after_itself_keeps_it_in_place(client: Client, ada: User) -> None:
    folder = projects.create_folder(ada, "Personal")
    projects.create_project(ada, "Work")

    response = _move(
        client,
        f"/api/v1/folders/{folder.pk}/move",
        {"after": {"kind": "folder", "id": folder.pk}},
    )

    assert response.status_code == 204
    assert _top_level(ada) == ["folder:Personal", "project:Work"]
