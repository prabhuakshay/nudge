"""Tests for changing a Task's Status, Blocked reason and Priority."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from apps.tasks import creation, services
from apps.tasks.models import Task

if TYPE_CHECKING:
    from django.test import Client
    from django.test.client import _MonkeyPatchedWSGIResponse as Response

    from apps.accounts.models import User


def _titles(response: Response) -> list[str]:
    return [item["title"] for item in response.json()["items"]]


@pytest.mark.django_db
def test_completing_a_task_closes_it(client: Client, ada: User) -> None:
    task = creation.create_task(services.inbox(ada), "Buy milk")

    response = client.patch(
        f"/api/v1/tasks/{task.pk}",
        {"status": "completed"},
        content_type="application/json",
    )

    assert response.status_code == 200
    body = response.json()
    assert body["task"]["status"] == "completed"
    assert body["task"]["completed_at"] is not None
    assert body["affected"] == [
        {"id": task.pk, "prior_status": "open", "prior_blocked_reason": ""},
    ]


@pytest.mark.django_db
def test_reopening_a_task_clears_its_completion_time(client: Client, ada: User) -> None:
    task = creation.create_task(services.inbox(ada), "Buy milk")
    services.update_task(ada, task.pk, services.TaskEdit(status=Task.Status.COMPLETED))

    response = client.patch(
        f"/api/v1/tasks/{task.pk}",
        {"status": "open"},
        content_type="application/json",
    )

    body = response.json()
    assert body["task"]["status"] == "open"
    assert body["task"]["completed_at"] is None
    assert body["affected"] == [
        {"id": task.pk, "prior_status": "completed", "prior_blocked_reason": ""},
    ]


@pytest.mark.django_db
def test_patch_without_a_status_change_affects_nothing(client: Client, ada: User) -> None:
    task = creation.create_task(services.inbox(ada), "Buy milk")

    response = client.patch(f"/api/v1/tasks/{task.pk}", {}, content_type="application/json")

    assert response.status_code == 200
    assert response.json()["affected"] == []


@pytest.mark.django_db
def test_blocking_a_task_keeps_its_reason_and_leaves_it_open(client: Client, ada: User) -> None:
    task = creation.create_task(services.inbox(ada), "Ship the release")

    response = client.patch(
        f"/api/v1/tasks/{task.pk}",
        {"status": "blocked", "blocked_reason": "  Waiting on review  "},
        content_type="application/json",
    )

    assert response.status_code == 200
    body = response.json()
    assert body["task"]["status"] == "blocked"
    assert body["task"]["blocked_reason"] == "Waiting on review"
    assert body["task"]["completed_at"] is None
    assert body["affected"] == [
        {"id": task.pk, "prior_status": "open", "prior_blocked_reason": ""},
    ]


@pytest.mark.django_db
def test_leaving_blocked_clears_the_reason_and_reports_it_for_undo(
    client: Client,
    ada: User,
) -> None:
    task = creation.create_task(services.inbox(ada), "Ship the release")
    services.update_task(
        ada,
        task.pk,
        services.TaskEdit(status=Task.Status.BLOCKED, blocked_reason="Waiting on review"),
    )

    response = client.patch(
        f"/api/v1/tasks/{task.pk}",
        {"status": "completed"},
        content_type="application/json",
    )

    body = response.json()
    assert body["task"]["blocked_reason"] == ""
    assert body["affected"] == [
        {"id": task.pk, "prior_status": "blocked", "prior_blocked_reason": "Waiting on review"},
    ]


@pytest.mark.django_db
@pytest.mark.parametrize("before", list(Task.Status))
@pytest.mark.parametrize("after", list(Task.Status))
def test_any_status_can_go_to_any_other(
    client: Client,
    ada: User,
    before: Task.Status,
    after: Task.Status,
) -> None:
    task = creation.create_task(services.inbox(ada), "Ship the release")
    services.update_task(ada, task.pk, services.TaskEdit(status=before))

    response = client.patch(
        f"/api/v1/tasks/{task.pk}",
        {"status": after},
        content_type="application/json",
    )

    assert response.status_code == 200
    body = response.json()["task"]
    assert body["status"] == after
    closed = after in {Task.Status.COMPLETED, Task.Status.WONT_DO}
    assert (body["completed_at"] is not None) == closed


@pytest.mark.django_db
def test_wont_do_and_blocked_sort_with_closed_and_open_tasks(client: Client, ada: User) -> None:
    inbox = services.inbox(ada)
    skipped = creation.create_task(inbox, "Skipped")
    services.update_task(ada, skipped.pk, services.TaskEdit(status=Task.Status.WONT_DO))
    waiting = creation.create_task(inbox, "Waiting")
    services.update_task(ada, waiting.pk, services.TaskEdit(status=Task.Status.BLOCKED))
    creation.create_task(inbox, "Open")

    open_response = client.get(f"/api/v1/tasks?project={inbox.pk}")
    closed_response = client.get(f"/api/v1/tasks?project={inbox.pk}&closed=true")

    assert _titles(open_response) == ["Open", "Waiting"]
    assert _titles(closed_response) == ["Skipped"]


@pytest.mark.django_db
def test_a_blocked_reason_needs_a_blocked_task(client: Client, ada: User) -> None:
    task = creation.create_task(services.inbox(ada), "Ship the release")

    response = client.patch(
        f"/api/v1/tasks/{task.pk}",
        {"blocked_reason": "Waiting on review"},
        content_type="application/json",
    )

    assert response.status_code == 422
    assert response.json() == {"detail": "Only a Blocked task can have a Blocked reason."}
    task.refresh_from_db()
    assert task.blocked_reason == ""


@pytest.mark.django_db
def test_patch_edits_the_reason_of_a_blocked_task(client: Client, ada: User) -> None:
    task = creation.create_task(services.inbox(ada), "Ship the release")
    services.update_task(ada, task.pk, services.TaskEdit(status=Task.Status.BLOCKED))

    response = client.patch(
        f"/api/v1/tasks/{task.pk}",
        {"blocked_reason": "Waiting on review"},
        content_type="application/json",
    )

    assert response.status_code == 200
    assert response.json()["task"]["blocked_reason"] == "Waiting on review"
    assert response.json()["affected"] == []


@pytest.mark.django_db
def test_patch_rejects_an_overlong_blocked_reason(client: Client, ada: User) -> None:
    task = creation.create_task(services.inbox(ada), "Ship the release")

    response = client.patch(
        f"/api/v1/tasks/{task.pk}",
        {"status": "blocked", "blocked_reason": "x" * 501},
        content_type="application/json",
    )

    assert response.status_code == 422


@pytest.mark.django_db
@pytest.mark.parametrize("priority", [1, 2, 3, 4, 0])
def test_patch_sets_the_priority(client: Client, ada: User, priority: int) -> None:
    task = creation.create_task(services.inbox(ada), "Ship the release")

    response = client.patch(
        f"/api/v1/tasks/{task.pk}",
        {"priority": priority},
        content_type="application/json",
    )

    assert response.status_code == 200
    assert response.json()["task"]["priority"] == priority
    assert response.json()["affected"] == []


@pytest.mark.django_db
@pytest.mark.parametrize("priority", [-1, 5])
def test_patch_rejects_an_unknown_priority(client: Client, ada: User, priority: int) -> None:
    task = creation.create_task(services.inbox(ada), "Ship the release")

    response = client.patch(
        f"/api/v1/tasks/{task.pk}",
        {"priority": priority},
        content_type="application/json",
    )

    assert response.status_code == 422


@pytest.mark.django_db
def test_patch_cannot_change_another_users_priority_or_status(
    client: Client,
    grace: User,
) -> None:
    task = creation.create_task(services.inbox(grace), "Grace's")

    response = client.patch(
        f"/api/v1/tasks/{task.pk}",
        {"priority": 1, "status": "blocked", "blocked_reason": "Mine now"},
        content_type="application/json",
    )

    assert response.status_code == 404
    task.refresh_from_db()
    assert task.priority == Task.Priority.NONE
    assert task.status == Task.Status.OPEN
    assert task.blocked_reason == ""
