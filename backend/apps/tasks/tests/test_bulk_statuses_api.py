"""Tests for giving several Tasks their own Statuses at once, as cascade Undo does."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from apps.tasks import creation, services
from apps.tasks.models import Task

if TYPE_CHECKING:
    from django.test import Client
    from django.test.client import _MonkeyPatchedWSGIResponse as Response

    from apps.accounts.models import User


def _set_statuses(
    client: Client,
    statuses: list[dict[str, object]],
    ids: list[object] | None = None,
) -> Response:
    ids = [entry["id"] for entry in statuses] if ids is None else ids
    return client.post(
        "/api/v1/tasks/bulk",
        {"ids": ids, "action": {"kind": "statuses", "statuses": statuses}},
        content_type="application/json",
    )


def _patch_status(client: Client, task: Task, status: str) -> list[dict[str, object]]:
    response = client.patch(
        f"/api/v1/tasks/{task.pk}",
        {"status": status},
        content_type="application/json",
    )
    affected: list[dict[str, object]] = response.json()["affected"]
    return affected


def _as_statuses(affected: list[dict[str, object]]) -> list[dict[str, object]]:
    return [
        {
            "id": item["id"],
            "status": item["prior_status"],
            "blocked_reason": item["prior_blocked_reason"],
        }
        for item in affected
    ]


def _status(task: Task) -> tuple[str, str]:
    fresh = Task.objects.get(pk=task.pk)
    return fresh.status, fresh.blocked_reason


@pytest.mark.django_db
def test_undoing_a_cascaded_close_gives_each_task_back_its_own_status(
    client: Client,
    ada: User,
) -> None:
    task = creation.create_task(services.inbox(ada), "Move house")
    pack = creation.create_subtask(task, "Pack").task
    van = creation.create_subtask(task, "Book a van").task
    services.update_task(
        ada, van.pk, services.TaskEdit(status=Task.Status.BLOCKED, blocked_reason="No licence")
    )
    affected = _patch_status(client, task, "completed")

    response = _set_statuses(client, _as_statuses(affected))

    assert response.status_code == 200
    assert _status(task) == ("open", "")
    assert _status(pack) == ("open", "")
    assert _status(van) == ("blocked", "No licence")


@pytest.mark.django_db
def test_undoing_a_reopen_closes_the_reopened_ancestors_again(client: Client, ada: User) -> None:
    task = creation.create_task(services.inbox(ada), "Move house")
    pack = creation.create_subtask(task, "Pack").task
    _patch_status(client, task, "completed")
    affected = _patch_status(client, pack, "open")

    _set_statuses(client, _as_statuses(affected))

    assert _status(task) == ("completed", "")
    assert _status(pack) == ("completed", "")


@pytest.mark.django_db
def test_statuses_must_name_the_tasks_given(client: Client, ada: User) -> None:
    task = creation.create_task(services.inbox(ada), "Move house")
    other = creation.create_task(services.inbox(ada), "Pay rent")

    response = _set_statuses(client, [{"id": task.pk, "status": "completed"}], ids=[other.pk])

    assert response.status_code == 422
    assert _status(task) == ("open", "")


@pytest.mark.django_db
def test_another_users_task_makes_setting_statuses_404(
    client: Client,
    ada: User,
    grace: User,
) -> None:
    mine = creation.create_task(services.inbox(ada), "Pay rent")
    theirs = creation.create_task(services.inbox(grace), "Buy milk")

    response = _set_statuses(
        client,
        [{"id": mine.pk, "status": "completed"}, {"id": theirs.pk, "status": "completed"}],
    )

    assert response.status_code == 404
    assert _status(mine) == ("open", "")
    assert _status(theirs) == ("open", "")
