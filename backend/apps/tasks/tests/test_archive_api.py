"""Tests for archiving Projects: the endpoints, the read-only rule and what archive hides."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client
from django.utils import timezone

from apps.tasks import projects, services
from apps.tasks.archive import active_tasks
from apps.tasks.models import Project, Task

if TYPE_CHECKING:
    from pathlib import Path

    from django.test.client import _MonkeyPatchedWSGIResponse as Response
    from pytest_django import Settings

    from apps.accounts.models import User


def _post(client: Client, path: str, data: object | None = None) -> Response:
    return client.post(path, data or {}, content_type="application/json")


def _patch(client: Client, path: str, data: object) -> Response:
    return client.patch(path, data, content_type="application/json")


@pytest.fixture
def media_root(settings: Settings, tmp_path: Path) -> Path:
    settings.MEDIA_ROOT = tmp_path
    settings.FILE_UPLOAD_TEMP_DIR = tmp_path / "uploads"
    settings.FILE_UPLOAD_TEMP_DIR.mkdir()
    return tmp_path


@pytest.fixture
def archived(ada: User) -> Project:
    """An archived Project of Ada's holding one Task."""
    project = projects.create_project(ada, "Garden")
    services.create_task(project, "Plant bulbs")
    projects.archive_project(ada, project.pk)
    project.refresh_from_db()
    return project


_ARCHIVED = {"detail": "“Garden” is archived. Unarchive it to change its tasks."}


@pytest.mark.django_db
@pytest.mark.parametrize("action", ["archive", "unarchive"])
def test_archive_endpoints_require_a_session(action: str) -> None:
    response = Client().post(f"/api/v1/projects/1/{action}")

    assert response.status_code == 401


@pytest.mark.django_db
def test_archive_marks_the_project_archived(client: Client, ada: User) -> None:
    project = projects.create_project(ada, "Garden")

    response = _post(client, f"/api/v1/projects/{project.pk}/archive")

    assert response.status_code == 200
    assert response.json()["is_archived"] is True


@pytest.mark.django_db
def test_archiving_the_inbox_is_refused(client: Client, ada: User) -> None:
    response = _post(client, f"/api/v1/projects/{services.inbox(ada).pk}/archive")

    assert response.status_code == 422
    assert response.json() == {"detail": "The Inbox can't be archived."}
    assert services.inbox(ada).archived_at is None


@pytest.mark.django_db
@pytest.mark.parametrize("action", ["archive", "unarchive"])
def test_another_users_project_is_not_found(client: Client, grace: User, action: str) -> None:
    project = projects.create_project(grace, "Theirs")
    if action == "unarchive":
        projects.archive_project(grace, project.pk)

    response = _post(client, f"/api/v1/projects/{project.pk}/{action}")

    assert response.status_code == 404
    project.refresh_from_db()
    assert (project.archived_at is not None) is (action == "unarchive")


@pytest.mark.django_db
def test_unarchive_puts_the_project_back_in_its_folder_and_place(
    client: Client,
    ada: User,
) -> None:
    folder = projects.create_folder(ada, "Personal")
    projects.create_project(ada, "Health", folder=folder)
    garden = projects.create_project(ada, "Garden", folder=folder)
    projects.create_project(ada, "Books", folder=folder)
    projects.archive_project(ada, garden.pk)

    response = _post(client, f"/api/v1/projects/{garden.pk}/unarchive")

    assert response.status_code == 200
    assert response.json()["is_archived"] is False
    assert [p.name for p in projects.folder_projects(folder)] == ["Health", "Garden", "Books"]


@pytest.mark.django_db
def test_sidebar_lists_archived_projects_by_name_apart_from_the_rest(
    client: Client,
    ada: User,
) -> None:
    folder = projects.create_folder(ada, "Personal")
    work = projects.create_project(ada, "work")
    garden = projects.create_project(ada, "Garden", folder=folder)
    projects.create_project(ada, "Books")
    services.create_task(garden, "Plant bulbs")
    projects.archive_project(ada, work.pk)
    projects.archive_project(ada, garden.pk)

    body = client.get("/api/v1/sidebar").json()

    assert [(item["kind"], item["name"]) for item in body["items"]] == [
        ("folder", "Personal"),
        ("project", "Books"),
    ]
    assert body["items"][0]["projects"] == []
    assert [
        (p["name"], p["folder_id"], p["is_archived"], p["open_count"]) for p in body["archived"]
    ] == [("Garden", folder.pk, True, 0), ("work", None, True, 0)]


@pytest.mark.django_db
def test_adding_a_task_to_an_archived_project_is_refused(
    client: Client,
    archived: Project,
) -> None:
    response = _post(client, "/api/v1/tasks", {"title": "Weed", "project_id": archived.pk})

    assert response.status_code == 422
    assert response.json() == _ARCHIVED
    assert archived.tasks.count() == 1


@pytest.mark.django_db
@pytest.mark.parametrize(
    "patch",
    [{"title": "Plant tulips"}, {"status": "completed"}, {"dates": {"due_date": "2026-11-01"}}],
)
def test_changing_a_task_in_an_archived_project_is_refused(
    client: Client,
    archived: Project,
    patch: dict[str, object],
) -> None:
    task = archived.tasks.get()

    response = _patch(client, f"/api/v1/tasks/{task.pk}", patch)

    assert response.status_code == 422
    assert response.json() == _ARCHIVED
    task.refresh_from_db()
    assert (task.title, task.status, task.due_date) == ("Plant bulbs", Task.Status.OPEN, None)


@pytest.mark.django_db
def test_moving_a_task_out_of_an_archived_project_is_refused(
    client: Client,
    ada: User,
    archived: Project,
) -> None:
    task = archived.tasks.get()

    response = _patch(client, f"/api/v1/tasks/{task.pk}", {"project_id": services.inbox(ada).pk})

    assert response.status_code == 422
    assert archived.tasks.count() == 1


@pytest.mark.django_db
def test_moving_a_task_into_an_archived_project_is_refused(
    client: Client,
    ada: User,
    archived: Project,
) -> None:
    task = services.create_task(services.inbox(ada), "Buy seeds")

    response = _patch(client, f"/api/v1/tasks/{task.pk}", {"project_id": archived.pk})

    assert response.status_code == 422
    assert response.json() == _ARCHIVED
    task.refresh_from_db()
    assert task.project_id == services.inbox(ada).pk


@pytest.mark.django_db
@pytest.mark.usefixtures("media_root")
def test_attaching_a_file_to_a_task_in_an_archived_project_is_refused(
    client: Client,
    archived: Project,
) -> None:
    task = archived.tasks.get()

    response = client.post(
        f"/api/v1/tasks/{task.pk}/attachments",
        {"file": SimpleUploadedFile("plan.txt", b"rows")},
    )

    assert response.status_code == 422
    assert response.json() == _ARCHIVED
    assert not task.attachments.exists()


@pytest.mark.django_db
@pytest.mark.usefixtures("media_root")
def test_deleting_a_file_from_a_task_in_an_archived_project_is_refused(
    client: Client,
    ada: User,
) -> None:
    project = projects.create_project(ada, "Garden")
    task = services.create_task(project, "Plant bulbs")
    attachment = services.attach_file(task, SimpleUploadedFile("plan.txt", b"rows"))
    projects.archive_project(ada, project.pk)

    response = client.delete(f"/api/v1/attachments/{attachment.pk}")

    assert response.status_code == 422
    assert response.json() == _ARCHIVED
    assert task.attachments.exists()


@pytest.mark.django_db
def test_an_archived_projects_tasks_can_still_be_read(
    client: Client,
    archived: Project,
) -> None:
    task = archived.tasks.get()

    listed = client.get(f"/api/v1/tasks?project={archived.pk}")
    read = client.get(f"/api/v1/tasks/{task.pk}")

    assert [item["title"] for item in listed.json()["items"]] == ["Plant bulbs"]
    assert read.status_code == 200


@pytest.mark.django_db
def test_an_unarchived_projects_tasks_can_be_changed_again(
    client: Client,
    ada: User,
    archived: Project,
) -> None:
    projects.unarchive_project(ada, archived.pk)
    task = archived.tasks.get()

    response = _patch(client, f"/api/v1/tasks/{task.pk}", {"title": "Plant tulips"})

    assert response.status_code == 200


@pytest.mark.django_db
def test_active_tasks_leave_out_archived_and_trashed_ones(ada: User, archived: Project) -> None:
    kept = services.create_task(services.inbox(ada), "Buy milk")
    trashed = services.create_task(services.inbox(ada), "Old")
    Task.objects.filter(pk=trashed.pk).update(deleted_at=timezone.now())

    assert [task.pk for task in active_tasks(ada)] == [kept.pk]
    assert archived.tasks.exists()
