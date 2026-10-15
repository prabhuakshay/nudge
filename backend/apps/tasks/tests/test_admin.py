"""Tests for the tasks app's admin pages."""

from __future__ import annotations

import pytest
from django.test import Client

from apps.accounts.models import User
from apps.tasks import creation, services
from apps.tasks.models import TaskActivity


@pytest.fixture
def admin_client() -> Client:
    root = User.objects.create_superuser("root@example.com", "pw", full_name="Root")
    client = Client()
    client.force_login(root)
    return client


@pytest.mark.django_db
def test_task_activity_lists_in_the_admin(admin_client: Client, ada: User) -> None:
    creation.create_task(services.inbox(ada), "Buy milk")

    response = admin_client.get("/admin/tasks/taskactivity/")

    assert response.status_code == 200
    assert "Buy milk" in response.content.decode()


@pytest.mark.django_db
def test_task_activity_is_read_only_in_the_admin(admin_client: Client, ada: User) -> None:
    creation.create_task(services.inbox(ada), "Buy milk")
    event = TaskActivity.objects.get()

    add = admin_client.get("/admin/tasks/taskactivity/add/")
    change = admin_client.post(f"/admin/tasks/taskactivity/{event.pk}/change/", {"kind": "moved"})
    delete = admin_client.get(f"/admin/tasks/taskactivity/{event.pk}/delete/")

    assert add.status_code == 403
    assert change.status_code == 403
    assert delete.status_code == 403
    assert TaskActivity.objects.get().kind == TaskActivity.Kind.CREATED
