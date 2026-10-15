"""Tests for the sidebar endpoint."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from django.test import Client

from apps.tasks import services
from apps.tasks.models import Task

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
        "inbox": {"id": services.inbox(ada).pk, "name": "Inbox", "open_count": 1},
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
