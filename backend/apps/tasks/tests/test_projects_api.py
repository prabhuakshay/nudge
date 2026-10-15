"""Tests for the Project endpoints."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from django.test import Client

from apps.core.palette import PaletteColor
from apps.tasks import projects, services
from apps.tasks.models import Project

if TYPE_CHECKING:
    from django.test.client import _MonkeyPatchedWSGIResponse as Response

    from apps.accounts.models import User


def _post(client: Client, path: str, data: object) -> Response:
    return client.post(path, data, content_type="application/json")


def _patch(client: Client, path: str, data: object) -> Response:
    return client.patch(path, data, content_type="application/json")


def _top_level(user: User) -> list[str]:
    """The sidebar's top level as `folder:<name>` and `project:<name>`, in order."""
    return [f"{type(item).__name__.lower()}:{item.name}" for item in projects.sidebar_items(user)]


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("post", "/api/v1/projects"),
        ("patch", "/api/v1/projects/1"),
        ("post", "/api/v1/projects/1/move"),
    ],
)
def test_every_endpoint_requires_a_session(method: str, path: str) -> None:
    response = getattr(Client(), method)(path)

    assert response.status_code == 401


@pytest.mark.django_db
def test_create_makes_a_project_with_a_palette_colour_and_the_list_icon(
    client: Client,
    ada: User,
) -> None:
    response = _post(client, "/api/v1/projects", {"name": "  Home  "})

    assert response.status_code == 201
    body = response.json()
    assert body == {
        "id": body["id"],
        "name": "Home",
        "color": body["color"],
        "icon": "list",
        "folder_id": None,
        "is_inbox": False,
    }
    assert body["color"] in PaletteColor.values
    assert ada.projects.get(pk=body["id"]).name == "Home"


@pytest.mark.django_db
def test_create_keeps_a_chosen_colour_and_icon(client: Client) -> None:
    response = _post(
        client,
        "/api/v1/projects",
        {"name": "Work", "color": "violet", "icon": "briefcase"},
    )

    assert response.status_code == 201
    assert (response.json()["color"], response.json()["icon"]) == ("violet", "briefcase")


@pytest.mark.django_db
@pytest.mark.parametrize(
    "fields",
    [
        {"name": ""},
        {"name": "   "},
        {"name": "x" * 65},
        {"name": "Work", "color": "black"},
        {"name": "Work", "icon": "skull"},
        {"name": "Work", "icon": "inbox"},
    ],
)
def test_create_rejects_a_bad_name_colour_or_icon(client: Client, fields: object) -> None:
    response = _post(client, "/api/v1/projects", fields)

    assert response.status_code == 422


@pytest.mark.django_db
def test_create_rejects_a_name_taken_by_another_project_whatever_its_case(
    client: Client,
    ada: User,
) -> None:
    projects.create_project(ada, "Work")

    response = _post(client, "/api/v1/projects", {"name": "WORK"})

    assert response.status_code == 422
    assert response.json() == {"detail": "You already have a Project named “WORK”."}


@pytest.mark.django_db
def test_create_allows_a_name_another_user_or_a_trashed_project_has(
    client: Client,
    ada: User,
    grace: User,
) -> None:
    projects.create_project(grace, "Work")
    trashed = projects.create_project(ada, "Home")
    Project.objects.filter(pk=trashed.pk).update(deleted_at="2026-01-01T00:00Z")

    assert _post(client, "/api/v1/projects", {"name": "Work"}).status_code == 201
    assert _post(client, "/api/v1/projects", {"name": "Home"}).status_code == 201


@pytest.mark.django_db
def test_create_appends_to_the_top_level_or_to_the_chosen_folder(
    client: Client,
    ada: User,
) -> None:
    folder = projects.create_folder(ada, "Personal")
    projects.create_project(ada, "Work")

    _post(client, "/api/v1/projects", {"name": "Home"})
    _post(client, "/api/v1/projects", {"name": "Health", "folder_id": folder.pk})
    _post(client, "/api/v1/projects", {"name": "Garden", "folder_id": folder.pk})

    assert _top_level(ada) == ["folder:Personal", "project:Work", "project:Home"]
    assert [project.name for project in projects.folder_projects(folder)] == ["Health", "Garden"]


@pytest.mark.django_db
def test_create_into_another_users_folder_is_not_found(client: Client, grace: User) -> None:
    folder = projects.create_folder(grace, "Theirs")

    response = _post(client, "/api/v1/projects", {"name": "Mine", "folder_id": folder.pk})

    assert response.status_code == 404
    assert not folder.projects.exists()


@pytest.mark.django_db
def test_patch_renames_recolours_and_changes_the_icon(client: Client, ada: User) -> None:
    project = projects.create_project(ada, "Work")

    response = _patch(
        client,
        f"/api/v1/projects/{project.pk}",
        {"name": " Job ", "color": "teal", "icon": "rocket"},
    )

    assert response.status_code == 200
    assert response.json() | {"id": 0} == {
        "id": 0,
        "name": "Job",
        "color": "teal",
        "icon": "rocket",
        "folder_id": None,
        "is_inbox": False,
    }


@pytest.mark.django_db
def test_patch_may_keep_the_name_in_another_case(client: Client, ada: User) -> None:
    project = projects.create_project(ada, "Work")

    response = _patch(client, f"/api/v1/projects/{project.pk}", {"name": "work"})

    assert response.status_code == 200
    assert response.json()["name"] == "work"


@pytest.mark.django_db
def test_patch_rejects_a_name_another_project_has(client: Client, ada: User) -> None:
    projects.create_project(ada, "Home")
    project = projects.create_project(ada, "Work")

    response = _patch(client, f"/api/v1/projects/{project.pk}", {"name": "home"})

    assert response.status_code == 422
    project.refresh_from_db()
    assert project.name == "Work"


@pytest.mark.django_db
@pytest.mark.parametrize("fields", [{"name": "Stuff"}, {"color": "red"}, {"icon": "star"}])
def test_patch_refuses_to_change_the_inbox(client: Client, ada: User, fields: object) -> None:
    response = _patch(client, f"/api/v1/projects/{services.inbox(ada).pk}", fields)

    assert response.status_code == 422
    assert response.json() == {"detail": "The Inbox can't be renamed, recoloured or moved."}


@pytest.mark.django_db
def test_patch_another_users_project_is_not_found(client: Client, grace: User) -> None:
    project = projects.create_project(grace, "Theirs")

    response = _patch(client, f"/api/v1/projects/{project.pk}", {"name": "Mine"})

    assert response.status_code == 404
    project.refresh_from_db()
    assert project.name == "Theirs"
