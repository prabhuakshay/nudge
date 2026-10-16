"""Tests for sending Projects to Trash with their Tasks and restoring them."""

from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta
from typing import TYPE_CHECKING

import pytest
from django.test import Client
from django.utils import timezone

from apps.accounts.services import set_time_zone
from apps.core.palette import PaletteColor
from apps.tasks import creation, project_trash, projects, services
from apps.tasks.dates import TaskDates
from apps.tasks.models import Project, Reminder, Task

if TYPE_CHECKING:
    from collections.abc import Callable

    from django.test.client import _MonkeyPatchedWSGIResponse as Response

    from apps.accounts.models import User


def _delete(client: Client, project: Project) -> Response:
    return client.delete(f"/api/v1/projects/{project.pk}")


def _restore(client: Client, project: Project) -> Response:
    return client.post(f"/api/v1/projects/{project.pk}/restore")


def _sidebar_names(client: Client) -> list[str]:
    sidebar = client.get("/api/v1/sidebar").json()
    return [item["name"] for item in sidebar["items"]]


def _trash(client: Client) -> list[dict[str, object]]:
    response = client.get("/api/v1/trash")
    assert response.status_code == 200
    rows: list[dict[str, object]] = response.json()
    return rows


def _titles(client: Client, project: Project) -> list[str]:
    response = client.get(f"/api/v1/tasks?project={project.pk}")
    return [item["title"] for item in response.json()["items"]]


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("method", "path"),
    [("delete", "/api/v1/projects/1"), ("post", "/api/v1/projects/1/restore")],
)
def test_deleting_and_restoring_a_project_require_a_session(method: str, path: str) -> None:
    response = getattr(Client(), method)(path)

    assert response.status_code == 401


@pytest.mark.django_db
def test_deleting_a_project_takes_it_and_its_tasks_out_of_view(client: Client, ada: User) -> None:
    home = projects.create_project(ada, "Home")
    projects.create_project(ada, "Work")
    creation.create_task(
        home, "Fix the tap", creation.NewTask(dates=TaskDates(due_date=timezone.localdate()))
    )

    response = _delete(client, home)

    assert response.status_code == 204
    assert _sidebar_names(client) == ["Work"]
    assert client.get("/api/v1/tasks?view=today").json()["items"] == []
    assert client.get("/api/v1/sidebar").json()["today_count"] == 0
    assert client.get(f"/api/v1/tasks?project={home.pk}").status_code == 404


@pytest.mark.django_db
def test_the_inbox_cannot_be_deleted(client: Client, ada: User) -> None:
    inbox = services.inbox(ada)

    response = _delete(client, inbox)

    assert response.status_code == 422
    assert response.json()["detail"] == "The Inbox can't be deleted."
    assert client.get(f"/api/v1/tasks?project={inbox.pk}").status_code == 200


@pytest.mark.django_db
def test_deleting_another_users_project_is_not_found(client: Client, grace: User) -> None:
    project = projects.create_project(grace, "Grace's")

    response = _delete(client, project)

    assert response.status_code == 404
    assert Project.objects.get(pk=project.pk).deleted_at is None


@pytest.mark.django_db
def test_restoring_another_users_project_is_not_found(client: Client, grace: User) -> None:
    project = projects.create_project(grace, "Grace's")
    project_trash.trash_project(grace, project.pk)

    response = _restore(client, project)

    assert response.status_code == 404
    assert _trash(client) == []
    assert Project.objects.get(pk=project.pk).deleted_at is not None


@pytest.mark.django_db
def test_restoring_a_live_project_is_not_found(client: Client, ada: User) -> None:
    project = projects.create_project(ada, "Home")

    assert _restore(client, project).status_code == 404


@pytest.mark.django_db
def test_a_deleted_project_is_one_trash_row_with_its_task_count(client: Client, ada: User) -> None:
    home = projects.create_project(ada, "Home", color=PaletteColor.TEAL, icon=Project.Icon.HOUSE)
    tap = creation.create_task(home, "Fix the tap")
    creation.create_subtask(tap, "Buy a washer")
    creation.create_task(home, "Paint the fence")

    _delete(client, home)

    [row] = _trash(client)
    assert row["kind"] == "project"
    assert row["id"] == home.pk
    assert row["name"] == "Home"
    assert row["color"] == "teal"
    assert row["icon"] == "house"
    assert row["task_count"] == 3
    expires = datetime.fromisoformat(str(row["expires_at"]))
    assert expires - datetime.fromisoformat(str(row["deleted_at"])) == timedelta(days=365)


@pytest.mark.django_db
def test_tasks_trashed_before_their_project_stay_their_own_units(
    client: Client,
    ada: User,
) -> None:
    home = projects.create_project(ada, "Home")
    creation.create_task(home, "Fix the tap")
    fence = creation.create_task(home, "Paint the fence")
    client.delete(f"/api/v1/tasks/{fence.pk}")

    _delete(client, home)
    _restore(client, home)

    assert [row["title"] for row in _trash(client)] == ["Paint the fence"]
    assert _titles(client, home) == ["Fix the tap"]


@pytest.mark.django_db
def test_a_task_deleted_with_its_project_comes_back_only_with_it(
    client: Client,
    ada: User,
) -> None:
    home = projects.create_project(ada, "Home")
    tap = creation.create_task(home, "Fix the tap")
    _delete(client, home)

    response = client.post(f"/api/v1/tasks/{tap.pk}/restore")

    assert response.status_code == 404
    assert Task.objects.get(pk=tap.pk).deleted_at is not None


@pytest.mark.django_db
def test_a_restored_project_comes_back_as_it_was(client: Client, ada: User) -> None:
    folder = projects.create_folder(ada, "Life")
    first = projects.create_project(ada, "Garden", folder=folder)
    home = projects.create_project(ada, "Home", color=PaletteColor.TEAL, folder=folder)
    projects.create_project(ada, "Car", folder=folder)
    tap = creation.create_task(home, "Fix the tap")
    creation.create_subtask(tap, "Buy a washer")
    projects.archive_project(ada, first.pk)
    projects.archive_project(ada, home.pk)
    _delete(client, home)

    response = _restore(client, home)

    assert response.status_code == 200
    body = response.json()
    assert (body["name"], body["color"], body["folder_id"]) == ("Home", "teal", folder.pk)
    assert body["is_archived"] is True
    projects.unarchive_project(ada, first.pk)
    projects.unarchive_project(ada, home.pk)
    [life] = client.get("/api/v1/sidebar").json()["items"]
    assert [project["name"] for project in life["projects"]] == ["Garden", "Home", "Car"]
    assert _titles(client, home) == ["Fix the tap", "Buy a washer"]
    assert _trash(client) == []


@pytest.mark.django_db
def test_a_restored_project_whose_name_was_taken_is_renamed(client: Client, ada: User) -> None:
    home = projects.create_project(ada, "Home")
    _delete(client, home)
    projects.create_project(ada, "home")
    projects.create_project(ada, "Home (2)")

    response = _restore(client, home)

    assert response.json()["name"] == "Home (3)"
    assert set(_sidebar_names(client)) == {"home", "Home (2)", "Home (3)"}


@pytest.mark.django_db
def test_a_renamed_restored_project_still_fits_the_name_limit(client: Client, ada: User) -> None:
    name = "x" * 64
    project = projects.create_project(ada, name)
    _delete(client, project)
    projects.create_project(ada, name)

    response = _restore(client, project)

    assert response.json()["name"] == "x" * 60 + " (2)"


@pytest.mark.django_db
def test_a_project_whose_folder_was_deleted_comes_back_ungrouped(
    client: Client,
    ada: User,
) -> None:
    folder = projects.create_folder(ada, "Life")
    home = projects.create_project(ada, "Home", folder=folder)
    projects.create_project(ada, "Work")
    _delete(client, home)
    projects.delete_folder(ada, folder.pk)

    response = _restore(client, home)

    assert response.json()["folder_id"] is None
    assert _sidebar_names(client) == ["Home", "Work"]


@pytest.mark.django_db
def test_a_project_whose_place_was_taken_comes_back_next_to_it(client: Client, ada: User) -> None:
    home = projects.create_project(ada, "Home")
    _delete(client, home)
    projects.create_project(ada, "Work")
    projects.create_project(ada, "Car")
    Project.objects.filter(name="Work").update(position=home.position)

    _restore(client, home)

    assert sorted(_sidebar_names(client)) == ["Car", "Home", "Work"]
    positions = Project.objects.filter(is_inbox=False).values_list("position", flat=True)
    assert len(set(positions)) == 3


@pytest.mark.django_db
def test_trash_and_restore_of_a_project_are_logged_on_its_tasks(
    client: Client,
    ada: User,
) -> None:
    home = projects.create_project(ada, "Home")
    tap = creation.create_task(home, "Fix the tap")
    _delete(client, home)

    _restore(client, home)

    activity = client.get(f"/api/v1/tasks/{tap.pk}/activity").json()["items"]
    assert [item["kind"] for item in activity] == ["restored", "trashed", "created"]


@pytest.mark.django_db
def test_a_trashed_projects_reminders_stop_and_resume_on_restore(
    ada: User,
    freeze_time: Callable[[datetime], None],
) -> None:
    freeze_time(datetime(2026, 11, 6, 13, 0, tzinfo=UTC))
    set_time_zone(ada, "UTC")
    home = projects.create_project(ada, "Home")
    dates = TaskDates(due_date=date(2026, 11, 6), due_time=time(14, 0))
    task = creation.create_task(home, "Call the plumber", creation.NewTask(dates=dates))
    services.update_task(ada, task.pk, services.TaskEdit(reminders=[timedelta(0)]))

    project_trash.trash_project(ada, home.pk)
    stopped = Reminder.objects.get(task=task).fire_at
    project_trash.restore_project(ada, home.pk)

    assert stopped is None
    assert Reminder.objects.get(task=task).fire_at == datetime(2026, 11, 6, 14, 0, tzinfo=UTC)
