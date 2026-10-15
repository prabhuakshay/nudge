"""Tests for moving a Task within its tree or to another Project with `POST /tasks/{id}/move`."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from apps.tasks import projects, services
from apps.tasks.models import Task, TaskActivity

if TYPE_CHECKING:
    from django.test import Client
    from django.test.client import _MonkeyPatchedWSGIResponse as Response

    from apps.accounts.models import User


def _move(client: Client, task: Task | int, **destination: int | None) -> Response:
    task_id = task if isinstance(task, int) else task.pk
    return client.post(
        f"/api/v1/tasks/{task_id}/move",
        destination,
        content_type="application/json",
    )


def _outline(client: Client, project_id: int) -> dict[str | None, list[str]]:
    """Return the titles in each of the Project's open sibling sets, by parent title, in order."""
    children: dict[str | None, list[str]] = {}
    for row in client.get(f"/api/v1/tasks?project={project_id}").json()["items"]:
        children.setdefault(row["parent_title"], []).append(row["title"])
    return children


def _roots(ada: User, *titles: str) -> list[Task]:
    """Create root Tasks in the Inbox that list in the order given."""
    return [services.create_task(services.inbox(ada), title) for title in reversed(titles)][::-1]


def _subtask(parent: Task, title: str) -> Task:
    return services.create_subtask(parent, title).task


def _kinds(task: Task) -> list[str]:
    return list(task.activity.order_by("at", "id").values_list("kind", flat=True))


@pytest.mark.django_db
def test_a_root_moves_right_after_the_sibling_it_now_follows(client: Client, ada: User) -> None:
    first, second, third = _roots(ada, "First", "Second", "Third")

    response = _move(client, first, after_id=second.pk)

    assert response.status_code == 200, response.json()
    assert _outline(client, third.project_id) == {None: ["Second", "First", "Third"]}


@pytest.mark.django_db
def test_no_neighbour_puts_the_task_first(client: Client, ada: User) -> None:
    first, _second, third = _roots(ada, "First", "Second", "Third")

    _move(client, third)

    assert _outline(client, first.project_id) == {None: ["Third", "First", "Second"]}


@pytest.mark.django_db
def test_a_stale_neighbour_puts_the_task_last(client: Client, ada: User) -> None:
    first, second = _roots(ada, "First", "Second")
    elsewhere = _subtask(second, "Not a sibling")

    response = _move(client, first, after_id=elsewhere.pk)

    assert response.status_code == 200
    assert _outline(client, first.project_id) == {
        None: ["Second", "First"],
        "Second": ["Not a sibling"],
    }


@pytest.mark.django_db
def test_reordering_writes_no_activity(client: Client, ada: User) -> None:
    first, second = _roots(ada, "First", "Second")

    _move(client, first, after_id=second.pk)

    assert _kinds(first) == ["created"]


@pytest.mark.django_db
def test_a_task_nests_under_a_new_parent_carrying_its_subtasks(client: Client, ada: User) -> None:
    trip, packing = _roots(ada, "Plan the trip", "Packing")
    _subtask(trip, "Book flights")
    _subtask(_subtask(packing, "Clothes"), "Socks")

    response = _move(client, packing, parent_id=trip.pk, after_id=None)

    body = response.json()["task"]
    assert (body["parent_id"], body["depth"]) == (trip.pk, 1)
    assert _outline(client, trip.project_id) == {
        None: ["Plan the trip"],
        "Plan the trip": ["Packing", "Book flights"],
        "Packing": ["Clothes"],
        "Clothes": ["Socks"],
    }


@pytest.mark.django_db
def test_a_subtask_moves_out_to_the_top_level(client: Client, ada: User) -> None:
    (trip,) = _roots(ada, "Plan the trip")
    flights = _subtask(trip, "Book flights")

    _move(client, flights, after_id=trip.pk)

    assert _outline(client, trip.project_id) == {None: ["Plan the trip", "Book flights"]}


@pytest.mark.django_db
def test_a_change_of_parent_is_logged_with_both_parents(client: Client, ada: User) -> None:
    trip, packing = _roots(ada, "Plan the trip", "Packing")
    flights = _subtask(trip, "Book flights")

    _move(client, flights, parent_id=packing.pk)
    _move(client, flights)

    events = client.get(f"/api/v1/tasks/{flights.pk}/activity").json()["items"]
    assert [event["data"] for event in events if event["kind"] == "moved"] == [
        {
            "from_project": "Inbox",
            "to_project": "Inbox",
            "from_parent": "Packing",
            "to_parent": None,
        },
        {
            "from_project": "Inbox",
            "to_project": "Inbox",
            "from_parent": "Plan the trip",
            "to_parent": "Packing",
        },
    ]


@pytest.mark.django_db
def test_a_pinned_task_that_becomes_a_subtask_drops_its_pin(client: Client, ada: User) -> None:
    trip, pinned = _roots(ada, "Plan the trip", "Pinned")
    client.patch(f"/api/v1/tasks/{pinned.pk}", {"pinned": True}, content_type="application/json")

    response = _move(client, pinned, parent_id=trip.pk)

    assert response.json()["task"]["pinned_at"] is None
    assert _kinds(pinned)[-2:] == ["unpinned", "moved"]


@pytest.mark.django_db
def test_a_root_moved_within_its_project_keeps_its_pin(client: Client, ada: User) -> None:
    pinned, other = _roots(ada, "Pinned", "Other")
    client.patch(f"/api/v1/tasks/{pinned.pk}", {"pinned": True}, content_type="application/json")

    response = _move(client, pinned, after_id=other.pk)

    assert response.json()["task"]["pinned_at"] is not None


@pytest.mark.django_db
def test_an_open_task_moved_under_a_closed_parent_reopens_it(client: Client, ada: User) -> None:
    done, todo = _roots(ada, "Done", "To do")
    client.patch(
        f"/api/v1/tasks/{done.pk}", {"status": "completed"}, content_type="application/json"
    )

    response = _move(client, todo, parent_id=done.pk)

    assert response.json()["affected"] == [
        {"id": done.pk, "prior_status": "completed", "prior_blocked_reason": ""},
    ]
    assert Task.objects.get(pk=done.pk).status == Task.Status.OPEN


@pytest.mark.django_db
def test_a_closed_task_moved_under_an_open_parent_changes_no_status(
    client: Client,
    ada: User,
) -> None:
    todo, done = _roots(ada, "To do", "Done")
    client.patch(
        f"/api/v1/tasks/{done.pk}", {"status": "completed"}, content_type="application/json"
    )

    response = _move(client, done, parent_id=todo.pk)

    assert response.json()["affected"] == []
    assert response.json()["task"]["status"] == "completed"


@pytest.mark.django_db
def test_a_move_past_the_fourth_level_is_refused(client: Client, ada: User) -> None:
    root, branch = _roots(ada, "Root", "Branch")
    deepest = _subtask(_subtask(root, "Level 1"), "Level 2")
    _subtask(branch, "Leaf")

    response = _move(client, branch, parent_id=deepest.pk)

    assert response.status_code == 422
    assert response.json() == {"detail": "Tasks can only nest four levels deep."}
    assert Task.objects.get(pk=branch.pk).parent_id is None


@pytest.mark.django_db
def test_a_task_cannot_go_under_itself_or_its_subtasks(client: Client, ada: User) -> None:
    (root,) = _roots(ada, "Root")
    child = _subtask(root, "Child")

    under_itself = _move(client, root, parent_id=root.pk)
    under_its_child = _move(client, root, parent_id=child.pk)

    assert under_itself.status_code == under_its_child.status_code == 422
    assert under_its_child.json() == {
        "detail": "A task can't go under itself or one of its subtasks.",
    }


@pytest.mark.django_db
def test_a_subtask_moved_to_another_project_becomes_a_root_there(
    client: Client,
    ada: User,
) -> None:
    work = projects.create_project(ada, "Work")
    already = services.create_task(work, "Already there")
    (trip,) = _roots(ada, "Plan the trip")
    flights = _subtask(trip, "Book flights")
    _subtask(flights, "Pick seats")

    response = _move(client, flights, project_id=work.pk, after_id=already.pk)

    assert response.status_code == 200
    assert _outline(client, work.pk) == {
        None: ["Already there", "Book flights"],
        "Book flights": ["Pick seats"],
    }
    moved = TaskActivity.objects.get(task=flights, kind=TaskActivity.Kind.MOVED)
    assert moved.data == {
        "from_project": "Inbox",
        "to_project": "Work",
        "from_parent": "Plan the trip",
        "to_parent": None,
    }


@pytest.mark.django_db
def test_a_task_can_nest_under_a_task_in_another_project(client: Client, ada: User) -> None:
    work = projects.create_project(ada, "Work")
    launch = services.create_task(work, "Launch")
    (notes,) = _roots(ada, "Notes")

    _move(client, notes, parent_id=launch.pk)

    assert _outline(client, work.pk) == {None: ["Launch"], "Launch": ["Notes"]}


@pytest.mark.django_db
def test_a_parent_in_another_project_than_the_one_given_is_refused(
    client: Client,
    ada: User,
) -> None:
    work = projects.create_project(ada, "Work")
    root, other = _roots(ada, "Root", "Other")

    response = _move(client, other, project_id=work.pk, parent_id=root.pk)

    assert response.status_code == 422
    assert response.json() == {"detail": "A subtask lives in its parent's project."}


@pytest.mark.django_db
@pytest.mark.parametrize("field", ["task", "project_id", "parent_id"])
def test_a_move_cannot_reach_another_users_tasks_or_projects(
    client: Client,
    ada: User,
    grace: User,
    field: str,
) -> None:
    (mine,) = _roots(ada, "Mine")
    theirs = services.create_task(services.inbox(grace), "Theirs")
    target = {
        "task": (theirs.pk, {}),
        "project_id": (mine.pk, {"project_id": theirs.project_id}),
        "parent_id": (mine.pk, {"parent_id": theirs.pk}),
    }
    task_id, destination = target[field]

    response = _move(client, task_id, **destination)

    assert response.status_code == 404
    assert Task.objects.get(pk=theirs.pk).subtasks.count() == 0
    assert Task.objects.get(pk=mine.pk).project.owner == ada
