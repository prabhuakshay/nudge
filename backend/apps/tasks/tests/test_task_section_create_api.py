"""Tests for adding a Task inside a Section."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from apps.tasks import projects, sections

if TYPE_CHECKING:
    from django.test import Client
    from django.test.client import _MonkeyPatchedWSGIResponse as Response

    from apps.accounts.models import User


def _create(client: Client, data: object) -> Response:
    return client.post("/api/v1/tasks", data, content_type="application/json")


def _sections_by_title(client: Client, project_id: int) -> dict[str, int | None]:
    response = client.get("/api/v1/tasks", {"project": project_id})
    return {row["title"]: row["section_id"] for row in response.json()["items"]}


@pytest.mark.django_db
def test_create_puts_the_task_in_the_section(client: Client, ada: User) -> None:
    work = projects.create_project(ada, "Work")
    to_do = sections.create_section(work, "To do")

    response = _create(client, {"title": "Paint", "project_id": work.pk, "section_id": to_do.pk})

    assert response.status_code == 201
    assert response.json()["section_id"] == to_do.pk
    assert _sections_by_title(client, work.pk) == {"Paint": to_do.pk}


@pytest.mark.django_db
def test_create_refuses_a_section_of_another_project(client: Client, ada: User) -> None:
    work = projects.create_project(ada, "Work")
    home = projects.create_project(ada, "Home")
    kitchen = sections.create_section(home, "Kitchen")

    response = _create(client, {"title": "Paint", "project_id": work.pk, "section_id": kitchen.pk})

    assert response.status_code == 422
    assert response.json() == {"detail": "That Section is in another Project."}
    assert _sections_by_title(client, work.pk) == {}


@pytest.mark.django_db
def test_create_in_the_inbox_refuses_a_section(client: Client, ada: User) -> None:
    home = projects.create_project(ada, "Home")
    kitchen = sections.create_section(home, "Kitchen")

    response = _create(client, {"title": "Paint", "section_id": kitchen.pk})

    assert response.status_code == 422
    assert response.json() == {"detail": "That Section is in another Project."}


@pytest.mark.django_db
def test_another_users_section_is_not_found(client: Client, ada: User, grace: User) -> None:
    work = projects.create_project(ada, "Work")
    theirs = sections.create_section(projects.create_project(grace, "Work"), "To do")

    response = _create(client, {"title": "Paint", "project_id": work.pk, "section_id": theirs.pk})

    assert response.status_code == 404
    assert response.json() == {"detail": "Section not found."}
    assert _sections_by_title(client, work.pk) == {}
    assert not theirs.tasks.exists()


@pytest.mark.django_db
def test_a_subtask_ignores_the_section_and_follows_its_root(client: Client, ada: User) -> None:
    work = projects.create_project(ada, "Work")
    to_do = sections.create_section(work, "To do")
    root = _create(client, {"title": "Paint", "project_id": work.pk, "section_id": to_do.pk})

    response = _create(
        client,
        {"title": "Buy brushes", "parent_id": root.json()["id"], "section_id": to_do.pk},
    )

    assert response.status_code == 201
    assert response.json()["section_id"] is None
