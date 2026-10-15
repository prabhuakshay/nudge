"""Tests for the sidebar endpoint."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from django.db import connection
from django.test import Client
from django.test.utils import CaptureQueriesContext

from apps.core.palette import PaletteColor
from apps.tasks import projects, services
from apps.tasks.models import Project, Task

if TYPE_CHECKING:
    from apps.accounts.models import User


@pytest.mark.django_db
def test_sidebar_requires_a_session() -> None:
    response = Client().get("/api/v1/sidebar")

    assert response.status_code == 401


@pytest.mark.django_db
def test_sidebar_shows_the_users_inbox_with_its_open_task_count(
    client: Client,
    ada: User,
    grace: User,
) -> None:
    services.create_task(services.inbox(ada), "Buy milk")
    done = services.create_task(services.inbox(ada), "Call mum")
    services.update_task(ada, done.pk, services.TaskEdit(status=Task.Status.COMPLETED))
    services.create_task(services.inbox(grace), "Grace's")

    response = client.get("/api/v1/sidebar")

    assert response.status_code == 200
    assert response.json() == {
        "inbox": {
            "kind": "project",
            "id": services.inbox(ada).pk,
            "name": "Inbox",
            "color": "blue",
            "icon": "inbox",
            "folder_id": None,
            "is_inbox": True,
            "is_archived": False,
            "open_count": 1,
        },
        "items": [],
        "tags": [],
        "archived": [],
        "today_count": 0,
        "upcoming_count": 0,
    }


@pytest.mark.django_db
def test_sidebar_counts_blocked_tasks_as_open_and_wont_do_as_closed(
    client: Client,
    ada: User,
) -> None:
    waiting = services.create_task(services.inbox(ada), "Waiting")
    services.update_task(ada, waiting.pk, services.TaskEdit(status=Task.Status.BLOCKED))
    skipped = services.create_task(services.inbox(ada), "Skipped")
    services.update_task(ada, skipped.pk, services.TaskEdit(status=Task.Status.WONT_DO))

    response = client.get("/api/v1/sidebar")

    assert response.json()["inbox"]["open_count"] == 1


@pytest.mark.django_db
def test_sidebar_lists_folders_and_ungrouped_projects_in_order_with_counts(
    client: Client,
    ada: User,
    grace: User,
) -> None:
    work = projects.create_project(
        ada, "Work", color=PaletteColor.VIOLET, icon=Project.Icon.BRIEFCASE
    )
    folder = projects.create_folder(ada, "Personal")
    health = projects.create_project(
        ada, "Health", folder=folder, color=PaletteColor.PINK, icon=Project.Icon.DUMBBELL
    )
    services.create_task(work, "Plan launch")
    services.create_task(work, "Write notes")
    projects.create_project(grace, "Grace's")
    trashed = projects.create_project(ada, "Old")
    Project.objects.filter(pk=trashed.pk).update(deleted_at="2026-01-01T00:00Z")

    response = client.get("/api/v1/sidebar")

    assert response.json()["items"] == [
        {
            "kind": "project",
            "id": work.pk,
            "name": "Work",
            "color": "violet",
            "icon": "briefcase",
            "folder_id": None,
            "is_inbox": False,
            "is_archived": False,
            "open_count": 2,
        },
        {
            "kind": "folder",
            "id": folder.pk,
            "name": "Personal",
            "collapsed": False,
            "projects": [
                {
                    "kind": "project",
                    "id": health.pk,
                    "name": "Health",
                    "color": "pink",
                    "icon": "dumbbell",
                    "folder_id": folder.pk,
                    "is_inbox": False,
                    "is_archived": False,
                    "open_count": 0,
                },
            ],
        },
    ]


@pytest.mark.django_db
def test_sidebar_takes_the_same_number_of_queries_however_many_projects(
    client: Client,
    ada: User,
) -> None:
    folder = projects.create_folder(ada, "Personal")
    projects.create_project(ada, "Work")
    client.get("/api/v1/sidebar")
    with CaptureQueriesContext(connection) as few:
        client.get("/api/v1/sidebar")
    for name in ["Home", "Health", "Garden"]:
        services.create_task(projects.create_project(ada, name, folder=folder), "A task")
    projects.create_folder(ada, "Work things")

    with CaptureQueriesContext(connection) as many:
        client.get("/api/v1/sidebar")

    assert len(many) == len(few)
