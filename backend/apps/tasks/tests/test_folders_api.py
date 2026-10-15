"""Tests for the Folder endpoints."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from django.test import Client

from apps.tasks import projects

if TYPE_CHECKING:
    from apps.accounts.models import User


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("post", "/api/v1/folders"),
        ("patch", "/api/v1/folders/1"),
        ("delete", "/api/v1/folders/1"),
        ("post", "/api/v1/folders/1/move"),
    ],
)
def test_every_endpoint_requires_a_session(method: str, path: str) -> None:
    response = getattr(Client(), method)(path)

    assert response.status_code == 401


@pytest.mark.django_db
def test_create_makes_an_expanded_folder_last_in_the_sidebar(client: Client, ada: User) -> None:
    projects.create_project(ada, "Work")

    response = client.post(
        "/api/v1/folders",
        {"name": "  Personal "},
        content_type="application/json",
    )

    assert response.status_code == 201
    body = response.json()
    assert body == {"id": body["id"], "name": "Personal", "collapsed": False}
    assert [item.name for item in projects.sidebar_items(ada)] == ["Work", "Personal"]


@pytest.mark.django_db
@pytest.mark.parametrize("name", ["", "  ", "x" * 65])
def test_create_rejects_a_blank_or_overlong_name(client: Client, name: str) -> None:
    response = client.post("/api/v1/folders", {"name": name}, content_type="application/json")

    assert response.status_code == 422


@pytest.mark.django_db
def test_patch_renames_and_collapses_a_folder(client: Client, ada: User) -> None:
    folder = projects.create_folder(ada, "Personal")

    response = client.patch(
        f"/api/v1/folders/{folder.pk}",
        {"name": "Home life", "collapsed": True},
        content_type="application/json",
    )

    assert response.status_code == 200
    assert response.json() == {"id": folder.pk, "name": "Home life", "collapsed": True}


@pytest.mark.django_db
def test_patch_leaves_fields_it_was_not_given(client: Client, ada: User) -> None:
    folder = projects.create_folder(ada, "Personal")

    response = client.patch(
        f"/api/v1/folders/{folder.pk}",
        {"collapsed": True},
        content_type="application/json",
    )

    assert response.json() == {"id": folder.pk, "name": "Personal", "collapsed": True}


@pytest.mark.django_db
def test_patch_another_users_folder_is_not_found(client: Client, grace: User) -> None:
    folder = projects.create_folder(grace, "Theirs")

    response = client.patch(
        f"/api/v1/folders/{folder.pk}",
        {"name": "Mine"},
        content_type="application/json",
    )

    assert response.status_code == 404
    folder.refresh_from_db()
    assert folder.name == "Theirs"


@pytest.mark.django_db
def test_delete_ungroups_the_projects_in_the_folders_place(client: Client, ada: User) -> None:
    projects.create_project(ada, "Work")
    folder = projects.create_folder(ada, "Personal")
    projects.create_project(ada, "Health", folder=folder)
    projects.create_project(ada, "Garden", folder=folder)
    projects.create_project(ada, "Reading")

    response = client.delete(f"/api/v1/folders/{folder.pk}")

    assert response.status_code == 204
    assert [item.name for item in projects.sidebar_items(ada)] == [
        "Work",
        "Health",
        "Garden",
        "Reading",
    ]
    assert not ada.folders.exists()


@pytest.mark.django_db
def test_delete_another_users_folder_is_not_found(client: Client, grace: User) -> None:
    folder = projects.create_folder(grace, "Theirs")

    response = client.delete(f"/api/v1/folders/{folder.pk}")

    assert response.status_code == 404
    assert grace.folders.exists()
