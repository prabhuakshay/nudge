"""Tests for changing a Section over the API: renaming, collapsing, moving and deleting it."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from apps.tasks import creation, project_trash, projects, sections

if TYPE_CHECKING:
    from django.test import Client
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


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("method", "suffix", "body"),
    [
        ("patch", "", {"name": "Next"}),
        ("post", "/move", {"after_id": None}),
        ("delete", "", None),
    ],
)
def test_a_section_in_a_trashed_project_is_not_found(
    client: Client, ada: User, method: str, suffix: str, body: dict[str, object] | None
) -> None:
    work = projects.create_project(ada, "Work")
    to_do = sections.create_section(work, "To do")
    project_trash.trash_project(ada, work.pk)

    response = getattr(client, method)(
        f"/api/v1/sections/{to_do.pk}{suffix}", body, content_type="application/json"
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Section not found."}
    to_do.refresh_from_db()
    assert to_do.name == "To do"


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("method", "suffix", "body"),
    [
        ("patch", "", {"name": "Next"}),
        ("patch", "", {"collapsed": True}),
        ("post", "/move", {"after_id": None}),
        ("delete", "", None),
    ],
)
def test_a_section_in_an_archived_project_is_read_only(
    client: Client, ada: User, method: str, suffix: str, body: dict[str, object] | None
) -> None:
    garden = projects.create_project(ada, "Garden")
    sections.create_section(garden, "First")
    to_do = sections.create_section(garden, "To do")
    projects.archive_project(ada, garden.pk)

    response = getattr(client, method)(
        f"/api/v1/sections/{to_do.pk}{suffix}", body, content_type="application/json"
    )

    assert response.status_code == 422
    assert response.json() == {"detail": "“Garden” is archived. Unarchive it to change its tasks."}
    listed = client.get(f"/api/v1/projects/{garden.pk}/sections").json()
    assert [(section["name"], section["collapsed"]) for section in listed] == [
        ("First", False),
        ("To do", False),
    ]
