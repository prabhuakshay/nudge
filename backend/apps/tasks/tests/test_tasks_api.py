"""Tests for the Task endpoints."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

import pytest
from django.test import Client

from apps.tasks import services
from apps.tasks.models import Task

if TYPE_CHECKING:
    from django.test.client import _MonkeyPatchedWSGIResponse as Response

    from apps.accounts.models import User


def _titles(response: Response) -> list[str]:
    return [item["title"] for item in response.json()["items"]]


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("get", "/api/v1/tasks?project=1"),
        ("post", "/api/v1/tasks"),
        ("get", "/api/v1/tasks/1"),
        ("patch", "/api/v1/tasks/1"),
        ("post", "/api/v1/tasks/1/move"),
    ],
)
def test_every_endpoint_requires_a_session(method: str, path: str) -> None:
    response = getattr(Client(), method)(path)

    assert response.status_code == 401


@pytest.mark.django_db
def test_create_adds_a_trimmed_task_to_the_inbox(client: Client, ada: User) -> None:
    response = client.post(
        "/api/v1/tasks",
        {"title": "  Buy milk  "},
        content_type="application/json",
    )

    assert response.status_code == 201
    body = response.json()
    assert body == {
        "id": body["id"],
        "project_id": services.inbox(ada).pk,
        "parent_id": None,
        "position": body["position"],
        "depth": 0,
        "parent_title": None,
        "title": "Buy milk",
        "status": "open",
        "priority": 0,
        "blocked_reason": "",
        "completed_at": None,
        "pinned_at": None,
        "due_date": None,
        "due_time": None,
        "start_date": None,
        "start_time": None,
        "is_overdue": False,
        "tags": [],
        "created_at": body["created_at"],
        "updated_at": body["updated_at"],
        "attachment_count": 0,
    }


@pytest.mark.django_db
@pytest.mark.parametrize("title", ["", "   ", "x" * 501])
def test_create_rejects_a_blank_or_overlong_title(client: Client, title: str) -> None:
    response = client.post("/api/v1/tasks", {"title": title}, content_type="application/json")

    assert response.status_code == 422


@pytest.mark.django_db
def test_create_into_another_users_project_is_not_found(client: Client, grace: User) -> None:
    response = client.post(
        "/api/v1/tasks",
        {"title": "Sneaky", "project_id": services.inbox(grace).pk},
        content_type="application/json",
    )

    assert response.status_code == 404
    assert not grace.tasks.exists()


@pytest.mark.django_db
def test_a_new_task_goes_first_in_its_project(client: Client, ada: User) -> None:
    project = services.inbox(ada).pk
    for title in ("First", "Second", "Third"):
        client.post(
            "/api/v1/tasks",
            {"title": title, "project_id": project},
            content_type="application/json",
        )

    response = client.get(f"/api/v1/tasks?project={project}")

    assert response.status_code == 200
    assert _titles(response) == ["Third", "Second", "First"]
    assert response.json()["next_cursor"] is None


@pytest.mark.django_db
def test_list_shows_only_open_tasks_by_default(client: Client, ada: User) -> None:
    services.create_task(services.inbox(ada), "Open one")
    done = services.create_task(services.inbox(ada), "Done one")
    services.update_task(ada, done.pk, services.TaskEdit(status=Task.Status.COMPLETED))

    response = client.get(f"/api/v1/tasks?project={services.inbox(ada).pk}")

    assert _titles(response) == ["Open one"]


@pytest.mark.django_db
def test_list_another_users_project_is_not_found(client: Client, grace: User) -> None:
    services.create_task(services.inbox(grace), "Grace's")

    response = client.get(f"/api/v1/tasks?project={services.inbox(grace).pk}")

    assert response.status_code == 404


@pytest.mark.django_db
def test_closed_tasks_are_newest_completed_first(client: Client, ada: User) -> None:
    start = datetime(2026, 10, 1, 9, tzinfo=UTC)
    for title, day in (("Oldest", 0), ("Newest", 2), ("Middle", 1)):
        task = services.create_task(services.inbox(ada), title)
        services.update_task(ada, task.pk, services.TaskEdit(status=Task.Status.COMPLETED))
        Task.objects.filter(pk=task.pk).update(completed_at=start + timedelta(days=day))
    services.create_task(services.inbox(ada), "Still open")

    response = client.get(f"/api/v1/tasks?project={services.inbox(ada).pk}&closed=true")

    assert _titles(response) == ["Newest", "Middle", "Oldest"]


@pytest.mark.django_db
def test_closed_tasks_come_in_pages_of_fifty(client: Client, ada: User) -> None:
    for number in range(55):
        task = services.create_task(services.inbox(ada), f"Task {number}")
        services.update_task(ada, task.pk, services.TaskEdit(status=Task.Status.COMPLETED))
    project = services.inbox(ada).pk

    first = client.get(f"/api/v1/tasks?project={project}&closed=true")
    cursor = first.json()["next_cursor"]
    second = client.get(f"/api/v1/tasks?project={project}&closed=true&cursor={cursor}")

    assert len(_titles(first)) == 50
    assert _titles(first)[0] == "Task 54"
    assert _titles(second) == [f"Task {number}" for number in range(4, -1, -1)]
    assert second.json()["next_cursor"] is None


@pytest.mark.django_db
def test_closed_tasks_reject_a_malformed_cursor(client: Client, ada: User) -> None:
    project = services.inbox(ada).pk

    response = client.get(f"/api/v1/tasks?project={project}&closed=true&cursor=nonsense")

    assert response.status_code == 422


@pytest.mark.django_db
def test_completing_a_task_closes_it(client: Client, ada: User) -> None:
    task = services.create_task(services.inbox(ada), "Buy milk")

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
    task = services.create_task(services.inbox(ada), "Buy milk")
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
    task = services.create_task(services.inbox(ada), "Buy milk")

    response = client.patch(f"/api/v1/tasks/{task.pk}", {}, content_type="application/json")

    assert response.status_code == 200
    assert response.json()["affected"] == []


@pytest.mark.django_db
def test_patch_another_users_task_is_not_found(client: Client, grace: User) -> None:
    task = services.create_task(services.inbox(grace), "Grace's")

    response = client.patch(
        f"/api/v1/tasks/{task.pk}",
        {"status": "completed"},
        content_type="application/json",
    )

    assert response.status_code == 404
    task.refresh_from_db()
    assert task.status == Task.Status.OPEN


@pytest.mark.django_db
def test_get_returns_the_task_with_its_description(client: Client, ada: User) -> None:
    task = services.create_task(services.inbox(ada), "Buy milk")
    Task.objects.filter(pk=task.pk).update(description="Semi-skimmed, **two** litres")

    response = client.get(f"/api/v1/tasks/{task.pk}")

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == task.pk
    assert body["title"] == "Buy milk"
    assert body["description"] == "Semi-skimmed, **two** litres"


@pytest.mark.django_db
def test_get_another_users_task_is_not_found(client: Client, grace: User) -> None:
    task = services.create_task(services.inbox(grace), "Grace's")

    response = client.get(f"/api/v1/tasks/{task.pk}")

    assert response.status_code == 404


@pytest.mark.django_db
def test_get_a_trashed_task_is_not_found(client: Client, ada: User) -> None:
    task = services.create_task(services.inbox(ada), "Gone")
    Task.objects.filter(pk=task.pk).update(deleted_at=datetime(2026, 10, 1, tzinfo=UTC))

    response = client.get(f"/api/v1/tasks/{task.pk}")

    assert response.status_code == 404


@pytest.mark.django_db
def test_patch_renames_a_task_with_a_trimmed_title(client: Client, ada: User) -> None:
    task = services.create_task(services.inbox(ada), "Buy milk")

    response = client.patch(
        f"/api/v1/tasks/{task.pk}",
        {"title": "  Buy oat milk  "},
        content_type="application/json",
    )

    assert response.status_code == 200
    assert response.json()["task"]["title"] == "Buy oat milk"
    assert response.json()["affected"] == []
    task.refresh_from_db()
    assert task.title == "Buy oat milk"


@pytest.mark.django_db
@pytest.mark.parametrize("title", ["", "   ", "x" * 501])
def test_patch_rejects_a_blank_or_overlong_title(client: Client, ada: User, title: str) -> None:
    task = services.create_task(services.inbox(ada), "Buy milk")

    response = client.patch(
        f"/api/v1/tasks/{task.pk}",
        {"title": title},
        content_type="application/json",
    )

    assert response.status_code == 422
    task.refresh_from_db()
    assert task.title == "Buy milk"


@pytest.mark.django_db
def test_patch_saves_the_description_as_written(client: Client, ada: User) -> None:
    task = services.create_task(services.inbox(ada), "Buy milk")
    description = "- semi-skimmed\n- two litres\n"

    response = client.patch(
        f"/api/v1/tasks/{task.pk}",
        {"description": description},
        content_type="application/json",
    )

    assert response.status_code == 200
    assert response.json()["task"]["description"] == description
    task.refresh_from_db()
    assert task.description == description


@pytest.mark.django_db
def test_patch_leaves_fields_it_was_not_given(client: Client, ada: User) -> None:
    task = services.create_task(services.inbox(ada), "Buy milk")
    Task.objects.filter(pk=task.pk).update(description="Two litres")

    client.patch(
        f"/api/v1/tasks/{task.pk}",
        {"status": "completed"},
        content_type="application/json",
    )

    task.refresh_from_db()
    assert task.title == "Buy milk"
    assert task.description == "Two litres"


@pytest.mark.django_db
def test_patch_cannot_rename_another_users_task(client: Client, grace: User) -> None:
    task = services.create_task(services.inbox(grace), "Grace's")

    response = client.patch(
        f"/api/v1/tasks/{task.pk}",
        {"title": "Mine now", "description": "Gotcha"},
        content_type="application/json",
    )

    assert response.status_code == 404
    task.refresh_from_db()
    assert task.title == "Grace's"
    assert task.description == ""


@pytest.mark.django_db
def test_blocking_a_task_keeps_its_reason_and_leaves_it_open(client: Client, ada: User) -> None:
    task = services.create_task(services.inbox(ada), "Ship the release")

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
    task = services.create_task(services.inbox(ada), "Ship the release")
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
    task = services.create_task(services.inbox(ada), "Ship the release")
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
    skipped = services.create_task(inbox, "Skipped")
    services.update_task(ada, skipped.pk, services.TaskEdit(status=Task.Status.WONT_DO))
    waiting = services.create_task(inbox, "Waiting")
    services.update_task(ada, waiting.pk, services.TaskEdit(status=Task.Status.BLOCKED))
    services.create_task(inbox, "Open")

    open_response = client.get(f"/api/v1/tasks?project={inbox.pk}")
    closed_response = client.get(f"/api/v1/tasks?project={inbox.pk}&closed=true")

    assert _titles(open_response) == ["Open", "Waiting"]
    assert _titles(closed_response) == ["Skipped"]


@pytest.mark.django_db
def test_a_blocked_reason_needs_a_blocked_task(client: Client, ada: User) -> None:
    task = services.create_task(services.inbox(ada), "Ship the release")

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
    task = services.create_task(services.inbox(ada), "Ship the release")
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
    task = services.create_task(services.inbox(ada), "Ship the release")

    response = client.patch(
        f"/api/v1/tasks/{task.pk}",
        {"status": "blocked", "blocked_reason": "x" * 501},
        content_type="application/json",
    )

    assert response.status_code == 422


@pytest.mark.django_db
@pytest.mark.parametrize("priority", [1, 2, 3, 4, 0])
def test_patch_sets_the_priority(client: Client, ada: User, priority: int) -> None:
    task = services.create_task(services.inbox(ada), "Ship the release")

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
    task = services.create_task(services.inbox(ada), "Ship the release")

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
    task = services.create_task(services.inbox(grace), "Grace's")

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
