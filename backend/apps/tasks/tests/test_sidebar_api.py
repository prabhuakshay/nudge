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
    services.update_task(ada, done.pk, services.TaskPatch(status=Task.Status.COMPLETED))
    services.create_task(services.inbox(grace), "Grace's")

    response = client.get("/api/v1/sidebar")

    assert response.status_code == 200
    assert response.json() == {
        "inbox": {"id": services.inbox(ada).pk, "name": "Inbox", "open_count": 1},
    }
