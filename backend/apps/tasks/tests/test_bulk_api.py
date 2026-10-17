"""Tests for changing several Tasks at once with `POST /tasks/bulk`."""

from __future__ import annotations

from datetime import date, time
from typing import TYPE_CHECKING

import pytest
from django.test import Client

from apps.tasks import creation, projects, sections, services, tags, trash
from apps.tasks.models import Task, TaskActivity

if TYPE_CHECKING:
    from django.test.client import _MonkeyPatchedWSGIResponse as Response

    from apps.accounts.models import User


def _bulk(client: Client, tasks: list[Task], action: dict[str, object]) -> Response:
    ids = [task.pk for task in tasks]
    return client.post(
        "/api/v1/tasks/bulk",
        {"ids": ids, "action": action},
        content_type="application/json",
    )


def _fresh(task: Task) -> Task:
    return Task.objects.get(pk=task.pk)


def _kinds(task: Task) -> list[str]:
    return list(TaskActivity.objects.filter(task=task).values_list("kind", flat=True))


@pytest.mark.django_db
def test_bulk_requires_a_session() -> None:
    response = Client().post("/api/v1/tasks/bulk")

    assert response.status_code == 401


@pytest.mark.django_db
def test_setting_status_closes_each_task_and_reports_it_for_undo(
    client: Client,
    ada: User,
) -> None:
    inbox = services.inbox(ada)
    rent, milk = creation.create_task(inbox, "Pay rent"), creation.create_task(inbox, "Buy milk")

    response = _bulk(client, [rent, milk], {"kind": "status", "status": "completed"})

    assert response.status_code == 200
    assert {_fresh(rent).status, _fresh(milk).status} == {Task.Status.COMPLETED}
    assert sorted(response.json()["affected"], key=lambda item: item["id"]) == [
        {"id": rent.pk, "prior_status": "open", "prior_blocked_reason": ""},
        {"id": milk.pk, "prior_status": "open", "prior_blocked_reason": ""},
    ]


@pytest.mark.django_db
def test_another_users_task_makes_the_whole_request_404(
    client: Client,
    ada: User,
    grace: User,
) -> None:
    mine = creation.create_task(services.inbox(ada), "Pay rent")
    theirs = creation.create_task(services.inbox(grace), "Buy milk")

    response = _bulk(client, [mine, theirs], {"kind": "priority", "priority": 1})

    assert response.status_code == 404
    assert response.json() == {"detail": "Task not found."}
    assert _fresh(mine).priority == Task.Priority.NONE
    assert _fresh(theirs).priority == Task.Priority.NONE


@pytest.mark.django_db
def test_a_trashed_task_makes_the_whole_request_404(client: Client, ada: User) -> None:
    inbox = services.inbox(ada)
    rent, milk = creation.create_task(inbox, "Pay rent"), creation.create_task(inbox, "Buy milk")
    trash.trash_task(ada, milk.pk)

    response = _bulk(client, [rent, milk], {"kind": "delete"})

    assert response.status_code == 404
    assert _fresh(rent).deleted_at is None


@pytest.mark.django_db
@pytest.mark.parametrize("kind", ["add_tag", "remove_tag"])
def test_another_users_tag_is_404(client: Client, ada: User, grace: User, kind: str) -> None:
    task = creation.create_task(services.inbox(ada), "Pay rent")
    theirs = tags.create_tag(grace, "home")

    response = _bulk(client, [task], {"kind": kind, "tag_id": theirs.pk})

    assert response.status_code == 404
    assert response.json() == {"detail": "Tag not found."}


@pytest.mark.django_db
def test_another_users_task_is_404_for_a_tag_too(
    client: Client,
    ada: User,
    grace: User,
) -> None:
    theirs = creation.create_task(services.inbox(grace), "Buy milk")
    home = tags.create_tag(ada, "home")

    response = _bulk(client, [theirs], {"kind": "add_tag", "tag_id": home.pk})

    assert response.status_code == 404
    assert not _fresh(theirs).tags.exists()


@pytest.mark.django_db
def test_moving_into_another_users_project_is_404(
    client: Client,
    ada: User,
    grace: User,
) -> None:
    task = creation.create_task(services.inbox(ada), "Pay rent")

    response = _bulk(client, [task], {"kind": "move", "project_id": services.inbox(grace).pk})

    assert response.status_code == 404
    assert response.json() == {"detail": "Project not found."}
    assert _fresh(task).project_id == services.inbox(ada).pk


@pytest.mark.django_db
def test_an_empty_selection_is_refused(client: Client) -> None:
    response = _bulk(client, [], {"kind": "delete"})

    assert response.status_code == 422


@pytest.mark.django_db
def test_closing_a_parent_cascades_and_logs_as_a_single_change_does(
    client: Client,
    ada: User,
) -> None:
    inbox = services.inbox(ada)
    parent, other = creation.create_task(inbox, "Move house"), creation.create_task(inbox, "Rent")
    step = creation.create_subtask(parent, "Pack books").task

    response = _bulk(client, [parent, other], {"kind": "status", "status": "wont_do"})

    assert response.status_code == 200
    assert _fresh(step).status == Task.Status.WONT_DO
    assert {item["id"] for item in response.json()["affected"]} == {parent.pk, other.pk, step.pk}
    event = TaskActivity.objects.get(task=parent, kind=TaskActivity.Kind.STATUS_CHANGED)
    assert event.data["closed_subtasks"] == 1


@pytest.mark.django_db
def test_setting_priority_logs_each_change_once(client: Client, ada: User) -> None:
    inbox = services.inbox(ada)
    rent, milk = creation.create_task(inbox, "Pay rent"), creation.create_task(inbox, "Buy milk")

    response = _bulk(client, [rent, milk, rent], {"kind": "priority", "priority": 2})

    assert response.status_code == 200
    assert response.json()["affected"] == []
    assert {_fresh(rent).priority, _fresh(milk).priority} == {Task.Priority.P2}
    assert _kinds(rent).count(TaskActivity.Kind.PRIORITY_CHANGED) == 1


@pytest.mark.django_db
def test_setting_dates_dates_each_task(client: Client, ada: User) -> None:
    inbox = services.inbox(ada)
    rent, milk = creation.create_task(inbox, "Pay rent"), creation.create_task(inbox, "Buy milk")

    response = _bulk(
        client,
        [rent, milk],
        {"kind": "dates", "dates": {"due_date": "2026-10-20", "due_time": "09:30"}},
    )

    assert response.status_code == 200
    assert {_fresh(rent).due_date, _fresh(milk).due_date} == {date(2026, 10, 20)}
    assert _fresh(milk).due_time == time(9, 30)
    assert TaskActivity.Kind.DATES_CHANGED in _kinds(rent)


@pytest.mark.django_db
def test_moving_takes_a_subtask_along_with_its_selected_parent(client: Client, ada: User) -> None:
    inbox = services.inbox(ada)
    work = projects.create_project(ada, "Work")
    parent = creation.create_task(inbox, "Move house")
    step = creation.create_subtask(parent, "Pack books").task
    loose = creation.create_subtask(creation.create_task(inbox, "Errands"), "Buy milk").task

    response = _bulk(client, [step, parent, loose], {"kind": "move", "project_id": work.pk})

    assert response.status_code == 200
    assert _fresh(step).parent_id == parent.pk
    assert _fresh(step).project_id == work.pk
    assert _fresh(loose).parent_id is None
    assert _fresh(loose).project_id == work.pk
    assert TaskActivity.Kind.MOVED in _kinds(parent)


@pytest.mark.django_db
def test_moving_to_another_project_leaves_the_section(client: Client, ada: User) -> None:
    work = projects.create_project(ada, "Work")
    home = projects.create_project(ada, "Home")
    to_do = sections.create_section(work, "To do")
    grouped = creation.create_task(work, "Grouped", creation.NewTask(section=to_do))

    response = _bulk(client, [grouped], {"kind": "move", "project_id": home.pk})

    assert response.status_code == 200
    assert (_fresh(grouped).project_id, _fresh(grouped).section_id) == (home.pk, None)


@pytest.mark.django_db
def test_adding_a_tag_skips_tasks_that_have_it(client: Client, ada: User) -> None:
    inbox = services.inbox(ada)
    home = tags.create_tag(ada, "home")
    rent = creation.create_task(inbox, "Pay rent", creation.NewTask(tags=[home]))
    milk = creation.create_task(inbox, "Buy milk")

    response = _bulk(client, [rent, milk], {"kind": "add_tag", "tag_id": home.pk})

    assert response.status_code == 200
    assert list(_fresh(milk).tags.all()) == [home]
    assert TaskActivity.Kind.TAG_ADDED not in _kinds(rent)
    assert TaskActivity.Kind.TAG_ADDED in _kinds(milk)


@pytest.mark.django_db
def test_removing_a_tag_keeps_the_others(client: Client, ada: User) -> None:
    inbox = services.inbox(ada)
    home, work = tags.create_tag(ada, "home"), tags.create_tag(ada, "work")
    rent = creation.create_task(inbox, "Pay rent", creation.NewTask(tags=[home, work]))
    milk = creation.create_task(inbox, "Buy milk")

    response = _bulk(client, [rent, milk], {"kind": "remove_tag", "tag_id": home.pk})

    assert response.status_code == 200
    assert list(_fresh(rent).tags.all()) == [work]
    assert TaskActivity.Kind.TAG_REMOVED in _kinds(rent)
    assert TaskActivity.Kind.TAG_REMOVED not in _kinds(milk)


@pytest.mark.django_db
def test_deleting_trashes_each_tree_as_its_own_unit(client: Client, ada: User) -> None:
    inbox = services.inbox(ada)
    parent, other = creation.create_task(inbox, "Move house"), creation.create_task(inbox, "Rent")
    step = creation.create_subtask(parent, "Pack books").task

    response = _bulk(client, [step, parent, other], {"kind": "delete"})

    assert response.status_code == 200
    assert response.json()["affected"] == []
    assert _fresh(step).trash_unit == _fresh(parent).trash_unit
    assert _fresh(other).trash_unit not in {None, _fresh(parent).trash_unit}


@pytest.mark.django_db
def test_one_refusal_leaves_every_task_as_it_was(client: Client, ada: User) -> None:
    inbox = services.inbox(ada)
    shelf = projects.create_project(ada, "Shelf")
    rent, old = creation.create_task(inbox, "Pay rent"), creation.create_task(shelf, "Old")
    projects.archive_project(ada, shelf.pk)

    response = _bulk(client, [rent, old], {"kind": "status", "status": "completed"})

    assert response.status_code == 422
    assert _fresh(rent).status == Task.Status.OPEN
    assert not TaskActivity.objects.filter(task=rent, kind=TaskActivity.Kind.STATUS_CHANGED)
