"""Tests for listing one Section's Tasks, or those in No section, open or Closed."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from apps.tasks import creation, projects, sections, services
from apps.tasks.models import Task

if TYPE_CHECKING:
    from django.test import Client
    from django.test.client import _MonkeyPatchedWSGIResponse as Response

    from apps.accounts.models import User
    from apps.tasks.models import Project, Section


def _titles(response: Response) -> list[str]:
    assert response.status_code == 200, response.json()
    return [item["title"] for item in response.json()["items"]]


def _add(project: Project, title: str, section: Section | None = None) -> Task:
    return creation.create_task(project, title, creation.NewTask(section=section))


def _close(task: Task) -> None:
    services.update_task(task.owner, task.pk, services.TaskEdit(status=Task.Status.COMPLETED))


@pytest.mark.django_db
def test_open_tasks_of_one_section_come_with_their_subtasks(client: Client, ada: User) -> None:
    work = projects.create_project(ada, "Work")
    kitchen = sections.create_section(work, "Kitchen")
    tile = _add(work, "Tile the wall", kitchen)
    creation.create_subtask(tile, "Buy grout")
    _add(work, "Paint", sections.create_section(work, "Bathroom"))
    _add(work, "Plan")

    response = client.get(f"/api/v1/tasks?project={work.pk}&section={kitchen.pk}")

    assert _titles(response) == ["Tile the wall", "Buy grout"]


@pytest.mark.django_db
def test_none_lists_the_open_tasks_in_no_section(client: Client, ada: User) -> None:
    work = projects.create_project(ada, "Work")
    _add(work, "Tile the wall", sections.create_section(work, "Kitchen"))
    plan = _add(work, "Plan")
    creation.create_subtask(plan, "Measure")

    response = client.get(f"/api/v1/tasks?project={work.pk}&section=none")

    assert _titles(response) == ["Plan", "Measure"]


@pytest.mark.django_db
def test_closed_tasks_of_one_section_or_no_section(client: Client, ada: User) -> None:
    work = projects.create_project(ada, "Work")
    kitchen = sections.create_section(work, "Kitchen")
    for task in (_add(work, "Tile the wall", kitchen), _add(work, "Plan")):
        _close(task)
    _add(work, "Paint", kitchen)

    in_kitchen = client.get(f"/api/v1/tasks?project={work.pk}&section={kitchen.pk}&closed=true")
    in_none = client.get(f"/api/v1/tasks?project={work.pk}&section=none&closed=true")

    assert _titles(in_kitchen) == ["Tile the wall"]
    assert _titles(in_none) == ["Plan"]


@pytest.mark.django_db
def test_another_users_section_is_not_found(client: Client, ada: User, grace: User) -> None:
    work = projects.create_project(ada, "Work")
    theirs = sections.create_section(projects.create_project(grace, "Work"), "Kitchen")

    response = client.get(f"/api/v1/tasks?project={work.pk}&section={theirs.pk}&closed=true")

    assert response.status_code == 404
    assert response.json() == {"detail": "Section not found."}


@pytest.mark.django_db
def test_a_section_of_another_project_is_not_found(client: Client, ada: User) -> None:
    work = projects.create_project(ada, "Work")
    garden = sections.create_section(projects.create_project(ada, "Home"), "Garden")

    response = client.get(f"/api/v1/tasks?project={work.pk}&section={garden.pk}")

    assert response.status_code == 404


@pytest.mark.django_db
def test_a_section_needs_a_project(client: Client, ada: User) -> None:
    kitchen = sections.create_section(projects.create_project(ada, "Work"), "Kitchen")

    response = client.get(f"/api/v1/tasks?view=today&section={kitchen.pk}")

    assert response.status_code == 422
