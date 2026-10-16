"""Tests for the Section endpoints."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from django.test import Client

from apps.tasks import creation, project_trash, projects, sections, services

if TYPE_CHECKING:
    from django.test.client import _MonkeyPatchedWSGIResponse as Response

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


def _patch(client: Client, section_id: int, body: dict[str, object]) -> Response:
    return client.patch(f"/api/v1/sections/{section_id}", body, content_type="application/json")


@pytest.mark.django_db
def test_patch_renames_a_section(client: Client, ada: User) -> None:
    work = projects.create_project(ada, "Work")
    to_do = _create(client, work, "To do")

    response = _patch(client, to_do, {"name": "  Next "})

    assert response.status_code == 200
    assert response.json() == {
        "id": to_do,
        "project_id": work.pk,
        "name": "Next",
        "collapsed": False,
    }
    assert _names(client, work) == ["Next"]


@pytest.mark.django_db
def test_patch_collapses_and_expands_a_section_and_keeps_it(client: Client, ada: User) -> None:
    work = projects.create_project(ada, "Work")
    to_do = _create(client, work, "To do")

    assert _patch(client, to_do, {"collapsed": True}).json()["collapsed"] is True
    listed = client.get(f"/api/v1/projects/{work.pk}/sections").json()
    assert [(section["name"], section["collapsed"]) for section in listed] == [("To do", True)]

    assert _patch(client, to_do, {"collapsed": False}).json()["collapsed"] is False


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("name", "reason"),
    [
        ("", "A Section needs a name."),
        ("   ", "A Section needs a name."),
        ("x" * 65, "A Section's name can be at most 64 characters."),
    ],
)
def test_patch_refuses_a_blank_or_overlong_name(
    client: Client, ada: User, name: str, reason: str
) -> None:
    work = projects.create_project(ada, "Work")
    to_do = _create(client, work, "To do")

    response = _patch(client, to_do, {"name": name})

    assert response.status_code == 422
    assert response.json() == {"detail": reason}
    assert _names(client, work) == ["To do"]


@pytest.mark.django_db
def test_patch_of_another_users_section_is_not_found(client: Client, grace: User) -> None:
    theirs = sections.create_section(projects.create_project(grace, "Theirs"), "To do")

    response = _patch(client, theirs.pk, {"name": "Mine", "collapsed": True})

    assert response.status_code == 404
    assert response.json() == {"detail": "Section not found."}
    theirs.refresh_from_db()
    assert (theirs.name, theirs.collapsed) == ("To do", False)


@pytest.mark.django_db
def test_delete_removes_the_section_and_keeps_its_tasks_in_no_section(
    client: Client, ada: User
) -> None:
    work = projects.create_project(ada, "Work")
    to_do = sections.create_section(work, "To do")
    creation.create_task(work, "Grouped", creation.NewTask(section=to_do))

    response = client.delete(f"/api/v1/sections/{to_do.pk}")

    assert response.status_code == 204
    assert _names(client, work) == []
    rows = client.get("/api/v1/tasks", {"project": work.pk}).json()["items"]
    assert [(row["title"], row["section_id"]) for row in rows] == [("Grouped", None)]


@pytest.mark.django_db
def test_deleting_another_users_section_is_not_found(client: Client, grace: User) -> None:
    theirs = sections.create_section(projects.create_project(grace, "Theirs"), "To do")

    response = client.delete(f"/api/v1/sections/{theirs.pk}")

    assert response.status_code == 404
    assert response.json() == {"detail": "Section not found."}
    assert grace.sections.filter(pk=theirs.pk).exists()


def _move(client: Client, section_id: int, after_id: int | None) -> int:
    response = client.post(
        f"/api/v1/sections/{section_id}/move",
        {"after_id": after_id},
        content_type="application/json",
    )
    status: int = response.status_code
    return status


@pytest.mark.django_db
def test_move_puts_a_section_right_after_another_or_first(client: Client, ada: User) -> None:
    work = projects.create_project(ada, "Work")
    to_do = _create(client, work, "To do")
    _create(client, work, "Doing")
    done = _create(client, work, "Done")

    assert _move(client, to_do, done) == 204
    assert _names(client, work) == ["Doing", "Done", "To do"]

    assert _move(client, done, None) == 204
    assert _names(client, work) == ["Done", "Doing", "To do"]

    assert _move(client, to_do, done) == 204
    assert _names(client, work) == ["Done", "To do", "Doing"]


@pytest.mark.django_db
def test_move_after_a_section_of_another_project_is_refused(client: Client, ada: User) -> None:
    work = projects.create_project(ada, "Work")
    home = projects.create_project(ada, "Home")
    _create(client, work, "To do")
    done = _create(client, work, "Done")
    later = _create(client, home, "Later")

    response = client.post(
        f"/api/v1/sections/{done}/move",
        {"after_id": later},
        content_type="application/json",
    )

    assert response.status_code == 422
    assert response.json() == {"detail": "That Section is in another Project."}
    assert _names(client, work) == ["To do", "Done"]


@pytest.mark.django_db
def test_move_of_another_users_section_is_not_found(client: Client, grace: User) -> None:
    theirs = projects.create_project(grace, "Theirs")
    first = sections.create_section(theirs, "First")
    second = sections.create_section(theirs, "Second")

    assert _move(client, second.pk, None) == 404
    assert list(sections.project_sections(theirs)) == [first, second]


@pytest.mark.django_db
def test_move_after_another_users_section_is_not_found(
    client: Client, ada: User, grace: User
) -> None:
    theirs = sections.create_section(projects.create_project(grace, "Theirs"), "To do")
    work = projects.create_project(ada, "Work")
    _create(client, work, "To do")
    done = _create(client, work, "Done")

    assert _move(client, done, theirs.pk) == 404
    assert _names(client, work) == ["To do", "Done"]
