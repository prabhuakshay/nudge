"""Tests for Mentions in Task texts and the Person view they feed."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from apps.tasks import people, projects, services
from apps.tasks.models import Task

if TYPE_CHECKING:
    from django.test import Client
    from django.test.client import _MonkeyPatchedWSGIResponse as Response

    from apps.accounts.models import User
    from apps.tasks.models import Person


def _post(client: Client, path: str, data: object) -> Response:
    return client.post(path, data, content_type="application/json")


def _patch(client: Client, path: str, data: object) -> Response:
    return client.patch(path, data, content_type="application/json")


def _mention(person: Person) -> str:
    return f"[@{person.name}](person:{person.pk})"


def _person_view(client: Client, person: Person, **query: str) -> list[str]:
    response = client.get("/api/v1/tasks", {"person": str(person.pk), **query})
    assert response.status_code == 200
    return [task["title"] for task in response.json()["items"]]


def _blocked(ada: User, title: str) -> Task:
    task = services.create_task(services.inbox(ada), title)
    services.update_task(ada, task.pk, services.TaskEdit(status=Task.Status.BLOCKED))
    return task


@pytest.mark.django_db
def test_a_task_shows_in_the_view_of_each_person_its_title_mentions(
    client: Client,
    ada: User,
) -> None:
    priya = people.create_person(ada, "Priya")
    sam = people.create_person(ada, "Sam")

    response = _post(
        client,
        "/api/v1/tasks",
        {"title": f"Call {_mention(priya)} about {_mention(sam)}"},
    )

    assert response.status_code == 201
    title = f"Call {_mention(priya)} about {_mention(sam)}"
    assert _person_view(client, priya) == [title]
    assert _person_view(client, sam) == [title]


@pytest.mark.django_db
@pytest.mark.parametrize("field", ["title", "description", "blocked_reason"])
def test_a_mention_in_any_text_puts_the_task_in_the_person_view(
    client: Client,
    ada: User,
    field: str,
) -> None:
    priya = people.create_person(ada, "Priya")
    task = _blocked(ada, "Fix the boiler")

    response = _patch(client, f"/api/v1/tasks/{task.pk}", {field: f"Ask {_mention(priya)}"})

    assert response.status_code == 200
    assert len(_person_view(client, priya)) == 1


@pytest.mark.django_db
def test_removing_the_last_mention_takes_the_task_out_of_the_view(
    client: Client,
    ada: User,
) -> None:
    priya = people.create_person(ada, "Priya")
    task = services.create_task(services.inbox(ada), f"Call {_mention(priya)}")
    _patch(client, f"/api/v1/tasks/{task.pk}", {"description": f"Thank {_mention(priya)}"})

    _patch(client, f"/api/v1/tasks/{task.pk}", {"title": "Call the plumber"})
    still_there = _person_view(client, priya)
    _patch(client, f"/api/v1/tasks/{task.pk}", {"description": "Thank them"})

    assert still_there == ["Call the plumber"]
    assert _person_view(client, priya) == []


@pytest.mark.django_db
def test_a_mention_of_another_users_person_is_refused_on_create(
    client: Client,
    grace: User,
) -> None:
    theirs = people.create_person(grace, "Priya")

    response = _post(client, "/api/v1/tasks", {"title": f"Call {_mention(theirs)}"})

    assert response.status_code == 422
    assert response.json() == {"detail": "A mention points at a Person you don't have."}


@pytest.mark.django_db
@pytest.mark.parametrize("field", ["title", "description", "blocked_reason"])
def test_a_mention_of_another_users_person_is_refused_in_every_text(
    client: Client,
    ada: User,
    grace: User,
    field: str,
) -> None:
    theirs = people.create_person(grace, "Priya")
    task = _blocked(ada, "Fix the boiler")

    response = _patch(client, f"/api/v1/tasks/{task.pk}", {field: f"Ask {_mention(theirs)}"})

    assert response.status_code == 422
    task.refresh_from_db()
    assert getattr(task, field) == {"title": "Fix the boiler"}.get(field, "")


@pytest.mark.django_db
def test_a_mention_of_a_missing_person_is_refused(client: Client) -> None:
    response = _post(client, "/api/v1/tasks", {"title": "Call [@Nobody](person:999999)"})

    assert response.status_code == 422


@pytest.mark.django_db
def test_the_person_view_lists_open_tasks_from_every_project_but_not_trashed_ones(
    client: Client,
    ada: User,
) -> None:
    priya = people.create_person(ada, "Priya")
    work = projects.create_project(ada, "Work")
    services.create_task(services.inbox(ada), f"Inbox {_mention(priya)}")
    services.create_task(work, f"Work {_mention(priya)}")
    services.create_task(work, "Unrelated")
    trashed = services.create_task(work, f"Trashed {_mention(priya)}")
    Task.objects.filter(pk=trashed.pk).update(deleted_at=trashed.created_at)
    done = services.create_task(work, f"Done {_mention(priya)}")
    services.update_task(ada, done.pk, services.TaskEdit(status=Task.Status.COMPLETED))

    titles = _person_view(client, priya)
    closed = _person_view(client, priya, closed="true")

    assert sorted(titles) == sorted([f"Inbox {_mention(priya)}", f"Work {_mention(priya)}"])
    assert closed == [f"Done {_mention(priya)}"]


@pytest.mark.django_db
def test_a_subtasks_mention_lists_the_subtask_alone_with_its_parents_title(
    client: Client,
    ada: User,
) -> None:
    priya = people.create_person(ada, "Priya")
    parent = services.create_task(services.inbox(ada), "Plan the trip")

    response = _post(
        client,
        "/api/v1/tasks",
        {"title": f"Ask {_mention(priya)}", "parent_id": parent.pk},
    )

    assert response.status_code == 201
    rows = client.get("/api/v1/tasks", {"person": str(priya.pk)}).json()["items"]
    assert [(row["title"], row["parent_title"]) for row in rows] == [
        (f"Ask {_mention(priya)}", "Plan the trip"),
    ]


@pytest.mark.django_db
def test_a_subtasks_mention_of_another_users_person_is_refused(
    client: Client,
    ada: User,
    grace: User,
) -> None:
    theirs = people.create_person(grace, "Priya")
    parent = services.create_task(services.inbox(ada), "Plan the trip")

    response = _post(
        client,
        "/api/v1/tasks",
        {"title": f"Ask {_mention(theirs)}", "parent_id": parent.pk},
    )

    assert response.status_code == 422
    assert not parent.subtasks.exists()


@pytest.mark.django_db
def test_a_duplicate_mentions_the_same_people(client: Client, ada: User) -> None:
    priya = people.create_person(ada, "Priya")
    task = services.create_task(services.inbox(ada), f"Call {_mention(priya)}")

    client.post(f"/api/v1/tasks/{task.pk}/duplicate")

    assert len(_person_view(client, priya)) == 2


@pytest.mark.django_db
def test_the_person_view_cannot_show_another_users_person(client: Client, grace: User) -> None:
    theirs = people.create_person(grace, "Priya")

    response = client.get("/api/v1/tasks", {"person": theirs.pk})

    assert response.status_code == 404


@pytest.mark.django_db
def test_a_list_needs_a_project_or_a_person(client: Client) -> None:
    response = client.get("/api/v1/tasks")

    assert response.status_code == 422


@pytest.mark.django_db
def test_renaming_a_person_rewrites_every_mention(client: Client, ada: User) -> None:
    priya = people.create_person(ada, "Priya")
    sam = people.create_person(ada, "Sam")
    task = _blocked(ada, f"Call {_mention(priya)} and {_mention(sam)}")
    _patch(client, f"/api/v1/tasks/{task.pk}", {"blocked_reason": f"Waiting on {_mention(priya)}"})

    _patch(client, f"/api/v1/people/{priya.pk}", {"name": "Priya Shah"})

    task.refresh_from_db()
    assert task.title == f"Call [@Priya Shah](person:{priya.pk}) and {_mention(sam)}"
    assert task.blocked_reason == f"Waiting on [@Priya Shah](person:{priya.pk})"


@pytest.mark.django_db
def test_deleting_a_person_leaves_their_mentions_as_plain_names(
    client: Client,
    ada: User,
) -> None:
    priya = people.create_person(ada, "Priya")
    task = services.create_task(services.inbox(ada), f"Call {_mention(priya)}")

    client.delete(f"/api/v1/people/{priya.pk}")

    task.refresh_from_db()
    assert task.title == "Call @Priya"
    assert not task.mentions.exists()


@pytest.mark.django_db
def test_merging_moves_every_mention_and_logs_it_on_affected_tasks(
    client: Client,
    ada: User,
) -> None:
    al = people.create_person(ada, "Al")
    alice = people.create_person(ada, "Alice")
    both = services.create_task(services.inbox(ada), f"{_mention(al)} meets {_mention(alice)}")
    only_al = services.create_task(services.inbox(ada), f"Call {_mention(al)}")
    untouched = services.create_task(services.inbox(ada), f"Email {_mention(alice)}")

    response = _post(client, f"/api/v1/people/{al.pk}/merge", {"into_id": alice.pk})

    assert response.status_code == 200
    assert response.json()["id"] == alice.pk
    assert sorted(_person_view(client, alice)) == sorted(
        [
            f"{_mention(alice)} meets {_mention(alice)}",
            f"Call {_mention(alice)}",
            f"Email {_mention(alice)}",
        ],
    )
    assert [person["name"] for person in client.get("/api/v1/people").json()] == ["Alice"]
    for task, merged in [(both, True), (only_al, True), (untouched, False)]:
        latest = client.get(f"/api/v1/tasks/{task.pk}/activity").json()["items"][0]
        assert (latest["kind"] == "person_merged") is merged
    latest = client.get(f"/api/v1/tasks/{only_al.pk}/activity").json()["items"][0]
    assert latest["data"] == {"from_person": "Al", "to_person": "Alice"}


@pytest.mark.django_db
def test_merging_a_person_into_themselves_is_refused(client: Client, ada: User) -> None:
    al = people.create_person(ada, "Al")

    response = _post(client, f"/api/v1/people/{al.pk}/merge", {"into_id": al.pk})

    assert response.status_code == 422


@pytest.mark.django_db
@pytest.mark.parametrize("theirs_is", ["source", "target"])
def test_merging_cannot_reach_another_users_person(
    client: Client,
    ada: User,
    grace: User,
    theirs_is: str,
) -> None:
    mine = people.create_person(ada, "Al")
    theirs = people.create_person(grace, "Alice")
    source, target = (theirs, mine) if theirs_is == "source" else (mine, theirs)

    response = _post(client, f"/api/v1/people/{source.pk}/merge", {"into_id": target.pk})

    assert response.status_code == 404
    assert ada.people.count() == 1
    assert grace.people.count() == 1
