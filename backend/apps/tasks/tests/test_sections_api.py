"""Tests for the Section endpoints."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from django.test import Client

from apps.tasks import creation, project_trash, projects, sections, services

if TYPE_CHECKING:
    from apps.accounts.models import User
    from apps.tasks.models import Project


def _create(client: Client, project: Project, name: str, after_id: int | None = None) -> int:
    body: dict[str, object] = {"name": name}
    if after_id is not None:
        body["after_id"] = after_id
    response = client.post(
        f"/api/v1/projects/{project.pk}/sections",
        body,
        content_type="application/json",
    )
    assert response.status_code == 201
    section_id: int = response.json()["id"]
    return section_id


def _names(client: Client, project: Project) -> list[str]:
    response = client.get(f"/api/v1/projects/{project.pk}/sections")
    assert response.status_code == 200
    return [section["name"] for section in response.json()]


@pytest.mark.django_db
def test_create_adds_an_expanded_section_to_the_project(client: Client, ada: User) -> None:
    work = projects.create_project(ada, "Work")

    response = client.post(
        f"/api/v1/projects/{work.pk}/sections",
        {"name": "  To do "},
        content_type="application/json",
    )

    assert response.status_code == 201
    body = response.json()
    assert body == {"id": body["id"], "project_id": work.pk, "name": "To do", "collapsed": False}
    assert _names(client, work) == ["To do"]


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("get", "/api/v1/projects/1/sections"),
        ("post", "/api/v1/projects/1/sections"),
        ("patch", "/api/v1/sections/1"),
        ("delete", "/api/v1/sections/1"),
        ("post", "/api/v1/sections/1/move"),
    ],
)
def test_every_endpoint_requires_a_session(method: str, path: str) -> None:
    response = getattr(Client(), method)(path)

    assert response.status_code == 401


@pytest.mark.django_db
def test_create_puts_a_section_last_or_right_after_another(client: Client, ada: User) -> None:
    work = projects.create_project(ada, "Work")
    to_do = _create(client, work, "To do")
    _create(client, work, "Done")

    _create(client, work, "Doing", after_id=to_do)

    assert _names(client, work) == ["To do", "Doing", "Done"]


@pytest.mark.django_db
def test_list_shows_only_the_projects_own_sections(client: Client, ada: User) -> None:
    work = projects.create_project(ada, "Work")
    home = projects.create_project(ada, "Home")
    _create(client, work, "To do")

    assert _names(client, home) == []


@pytest.mark.django_db
def test_the_inbox_has_no_sections(client: Client, ada: User) -> None:
    response = client.post(
        f"/api/v1/projects/{services.inbox(ada).pk}/sections",
        {"name": "To do"},
        content_type="application/json",
    )

    assert response.status_code == 422
    assert response.json() == {"detail": "The Inbox has no Sections."}
    assert not ada.sections.exists()


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("name", "reason"),
    [
        ("", "A Section needs a name."),
        ("   ", "A Section needs a name."),
        ("x" * 65, "A Section's name can be at most 64 characters."),
    ],
)
def test_create_refuses_a_blank_or_overlong_name(
    client: Client, ada: User, name: str, reason: str
) -> None:
    work = projects.create_project(ada, "Work")

    response = client.post(
        f"/api/v1/projects/{work.pk}/sections",
        {"name": name},
        content_type="application/json",
    )

    assert response.status_code == 422
    assert response.json() == {"detail": reason}


@pytest.mark.django_db
def test_the_same_name_is_allowed_in_different_projects(client: Client, ada: User) -> None:
    work = projects.create_project(ada, "Work")
    home = projects.create_project(ada, "Home")
    _create(client, work, "To do")

    _create(client, home, "To do")

    assert _names(client, home) == ["To do"]


@pytest.mark.django_db
def test_create_after_a_section_of_another_project_is_refused(client: Client, ada: User) -> None:
    work = projects.create_project(ada, "Work")
    home = projects.create_project(ada, "Home")
    to_do = _create(client, work, "To do")

    response = client.post(
        f"/api/v1/projects/{home.pk}/sections",
        {"name": "Later", "after_id": to_do},
        content_type="application/json",
    )

    assert response.status_code == 422
    assert response.json() == {"detail": "That Section is in another Project."}


@pytest.mark.django_db
@pytest.mark.parametrize("method", ["get", "post"])
def test_another_users_project_is_not_found(client: Client, grace: User, method: str) -> None:
    theirs = projects.create_project(grace, "Theirs")

    response = getattr(client, method)(
        f"/api/v1/projects/{theirs.pk}/sections",
        {"name": "Mine"},
        content_type="application/json",
    )

    assert response.status_code == 404
    assert not grace.sections.exists()


@pytest.mark.django_db
def test_a_trashed_project_is_not_found(client: Client, ada: User) -> None:
    work = projects.create_project(ada, "Work")
    project_trash.trash_project(ada, work.pk)

    response = client.get(f"/api/v1/projects/{work.pk}/sections")

    assert response.status_code == 404


@pytest.mark.django_db
def test_create_after_another_users_section_is_not_found(
    client: Client, ada: User, grace: User
) -> None:
    theirs = sections.create_section(projects.create_project(grace, "Theirs"), "To do")
    work = projects.create_project(ada, "Work")

    response = client.post(
        f"/api/v1/projects/{work.pk}/sections",
        {"name": "Mine", "after_id": theirs.pk},
        content_type="application/json",
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Section not found."}
    assert not ada.sections.exists()


@pytest.mark.django_db
def test_task_rows_carry_their_section(client: Client, ada: User) -> None:
    work = projects.create_project(ada, "Work")
    to_do = sections.create_section(work, "To do")
    creation.create_task(work, "Grouped", creation.NewTask(section=to_do))
    creation.create_task(work, "Loose")

    response = client.get("/api/v1/tasks", {"project": work.pk})

    rows = {row["title"]: row["section_id"] for row in response.json()["items"]}
    assert rows == {"Grouped": to_do.pk, "Loose": None}
