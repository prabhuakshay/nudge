"""Tests for Subtasks through the Task endpoints: nesting, the tree rows and Status cascades."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from apps.tasks import creation, services

if TYPE_CHECKING:
    from django.test import Client

    from apps.accounts.models import User
    from apps.tasks.models import Task


def _add(client: Client, title: str, parent: Task | int) -> dict[str, object]:
    parent_id = parent if isinstance(parent, int) else parent.pk
    response = client.post(
        "/api/v1/tasks",
        {"title": title, "parent_id": parent_id},
        content_type="application/json",
    )
    assert response.status_code == 201, response.json()
    body: dict[str, object] = response.json()
    return body


@pytest.mark.django_db
def test_a_subtask_lives_under_its_parent_in_the_parents_project(
    client: Client,
    ada: User,
) -> None:
    parent = creation.create_task(services.inbox(ada), "Plan the trip")

    subtask = _add(client, "Book flights", parent)

    assert subtask["parent_id"] == parent.pk
    assert subtask["project_id"] == parent.project_id
    assert subtask["depth"] == 1
    assert subtask["parent_title"] == "Plan the trip"


@pytest.mark.django_db
def test_subtasks_nest_four_levels_deep_and_no_further(client: Client, ada: User) -> None:
    deepest = _chain(client, ada, 4)[-1]

    response = client.post(
        "/api/v1/tasks",
        {"title": "Level 4", "parent_id": deepest},
        content_type="application/json",
    )

    assert response.status_code == 422
    assert response.json() == {"detail": "Tasks can only nest four levels deep."}
    assert not ada.tasks.filter(title="Level 4").exists()


@pytest.mark.django_db
def test_a_subtask_cannot_go_under_another_users_task(client: Client, grace: User) -> None:
    theirs = creation.create_task(services.inbox(grace), "Grace's")

    response = client.post(
        "/api/v1/tasks",
        {"title": "Sneaky", "parent_id": theirs.pk},
        content_type="application/json",
    )

    assert response.status_code == 404
    assert grace.tasks.count() == 1


@pytest.mark.django_db
def test_a_subtask_ignores_a_project_other_than_its_parents(client: Client, ada: User) -> None:
    parent = creation.create_task(services.inbox(ada), "Plan the trip")
    other = ada.projects.create(name="Work")

    response = client.post(
        "/api/v1/tasks",
        {"title": "Book flights", "parent_id": parent.pk, "project_id": other.pk},
        content_type="application/json",
    )

    assert response.json()["project_id"] == parent.project_id


@pytest.mark.django_db
def test_the_list_returns_flat_rows_with_new_subtasks_last_among_their_siblings(
    client: Client,
    ada: User,
) -> None:
    parent = creation.create_task(services.inbox(ada), "Plan the trip")
    flights = _add(client, "Book flights", parent)
    _add(client, "Book hotel", parent)
    _add(client, "Pick seats", _id(flights))

    rows = client.get(f"/api/v1/tasks?project={parent.project_id}").json()["items"]

    children: dict[str | None, list[str]] = {}
    for row in rows:
        children.setdefault(row["parent_title"], []).append(row["title"])
    assert children == {
        None: ["Plan the trip"],
        "Plan the trip": ["Book flights", "Book hotel"],
        "Book flights": ["Pick seats"],
    }
    assert {row["title"]: row["depth"] for row in rows} == {
        "Plan the trip": 0,
        "Book flights": 1,
        "Book hotel": 1,
        "Pick seats": 2,
    }


@pytest.mark.django_db
def test_open_trees_keep_their_closed_subtasks_and_closed_trees_come_whole(
    client: Client,
    ada: User,
) -> None:
    open_root = creation.create_task(services.inbox(ada), "Open root")
    _patch(client, _id(_add(client, "Done step", open_root)), "completed")
    closed_root = creation.create_task(services.inbox(ada), "Closed root")
    _add(client, "Closed step", closed_root)
    _patch(client, closed_root, "completed")
    project = open_root.project_id

    open_rows = client.get(f"/api/v1/tasks?project={project}").json()["items"]
    closed_rows = client.get(f"/api/v1/tasks?project={project}&closed=true").json()["items"]

    assert [row["title"] for row in open_rows] == ["Open root", "Done step"]
    assert [row["title"] for row in closed_rows] == ["Closed root", "Closed step"]


@pytest.mark.django_db
def test_closing_a_parent_closes_its_open_and_blocked_descendants_with_the_same_status(
    client: Client,
    ada: User,
) -> None:
    root, child, grandchild = _chain(client, ada, 3)
    _patch(client, grandchild, "blocked")
    done = _id(_add(client, "Already done", root))
    _patch(client, done, "completed")

    body = _patch(client, root, "wont_do")

    assert _statuses(ada) == {
        "Level 0": "wont_do",
        "Level 1": "wont_do",
        "Level 2": "wont_do",
        "Already done": "completed",
    }
    assert body["affected"] == [
        {"id": root, "prior_status": "open", "prior_blocked_reason": ""},
        {"id": child, "prior_status": "open", "prior_blocked_reason": ""},
        {"id": grandchild, "prior_status": "blocked", "prior_blocked_reason": ""},
    ]


@pytest.mark.django_db
def test_undo_sends_the_prior_statuses_back(client: Client, ada: User) -> None:
    root = _chain(client, ada, 3)[0]
    affected = _patch(client, root, "completed")["affected"]
    assert isinstance(affected, list)

    for prior in affected:
        _patch(client, prior["id"], prior["prior_status"])

    assert set(ada.tasks.values_list("status", flat=True)) == {"open"}


@pytest.mark.django_db
def test_closing_the_last_open_subtask_leaves_the_parent_open(client: Client, ada: User) -> None:
    child = _chain(client, ada, 2)[1]

    body = _patch(client, child, "completed")

    assert _statuses(ada) == {"Level 0": "open", "Level 1": "completed"}
    assert body["affected"] == [
        {"id": child, "prior_status": "open", "prior_blocked_reason": ""},
    ]


@pytest.mark.django_db
def test_reopening_a_parent_leaves_its_subtasks_as_they_were(client: Client, ada: User) -> None:
    root = _chain(client, ada, 2)[0]
    _patch(client, root, "completed")

    _patch(client, root, "open")

    assert _statuses(ada) == {"Level 0": "open", "Level 1": "completed"}


@pytest.mark.django_db
def test_reopening_a_subtask_reopens_its_closed_ancestors(client: Client, ada: User) -> None:
    root, child, grandchild = _chain(client, ada, 3)
    _patch(client, root, "completed")

    body = _patch(client, grandchild, "blocked")

    assert _statuses(ada) == {"Level 0": "open", "Level 1": "open", "Level 2": "blocked"}
    assert body["affected"] == [
        {"id": grandchild, "prior_status": "completed", "prior_blocked_reason": ""},
        {"id": child, "prior_status": "completed", "prior_blocked_reason": ""},
        {"id": root, "prior_status": "completed", "prior_blocked_reason": ""},
    ]


@pytest.mark.django_db
def test_adding_a_subtask_under_a_closed_parent_reopens_it(client: Client, ada: User) -> None:
    root, child = _chain(client, ada, 2)
    _patch(client, root, "completed")

    _add(client, "One more thing", child)

    assert _statuses(ada) == {"Level 0": "open", "Level 1": "open", "One more thing": "open"}


@pytest.mark.django_db
def test_a_cascade_logs_one_event_per_task_naming_its_cause(client: Client, ada: User) -> None:
    root, child, grandchild = _chain(client, ada, 3)
    _patch(client, root, "completed")
    _patch(client, grandchild, "open")

    def newest(task_id: int) -> object:
        return client.get(f"/api/v1/tasks/{task_id}/activity").json()["items"][:2]

    root_events, child_events = newest(root), newest(child)
    assert isinstance(root_events, list)
    assert isinstance(child_events, list)
    assert [event["data"] for event in root_events] == [
        _status_data("completed", "open", via_subtask="Level 2"),
        _status_data("open", "completed", closed_subtasks=2),
    ]
    assert [event["data"] for event in child_events] == [
        _status_data("completed", "open", via_subtask="Level 2"),
        _status_data("open", "completed", via_parent="Level 0"),
    ]


@pytest.mark.django_db
def test_get_returns_the_breadcrumb_and_the_subtask_tree(client: Client, ada: User) -> None:
    root, child, grandchild = _chain(client, ada, 3)

    middle = client.get(f"/api/v1/tasks/{child}").json()

    assert middle["ancestors"] == [{"id": root, "title": "Level 0"}]
    assert [(row["id"], row["parent_id"]) for row in middle["subtasks"]] == [(grandchild, child)]


def _id(row: dict[str, object]) -> int:
    task_id = row["id"]
    assert isinstance(task_id, int)
    return task_id


def _status_data(
    old: str,
    new: str,
    *,
    via_parent: str | None = None,
    via_subtask: str | None = None,
    closed_subtasks: int = 0,
) -> dict[str, object]:
    return {
        "old": old,
        "new": new,
        "blocked_reason": "",
        "via_parent": via_parent,
        "via_subtask": via_subtask,
        "closed_subtasks": closed_subtasks,
    }


def _patch(client: Client, task: Task | int, status: str) -> dict[str, object]:
    task_id = task if isinstance(task, int) else task.pk
    response = client.patch(
        f"/api/v1/tasks/{task_id}",
        {"status": status},
        content_type="application/json",
    )
    assert response.status_code == 200, response.json()
    body: dict[str, object] = response.json()
    return body


def _statuses(ada: User) -> dict[str, str]:
    return dict(ada.tasks.values_list("title", "status"))


def _chain(client: Client, ada: User, length: int) -> list[int]:
    """Create a root with one Subtask per level below it, `length` Tasks in all; return ids."""
    ids = [creation.create_task(services.inbox(ada), "Level 0").pk]
    for level in range(1, length):
        ids.append(_id(_add(client, f"Level {level}", ids[-1])))
    return ids
