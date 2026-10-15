"""Tests for searching Tasks by their title, Description and Comments."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING

import pytest
from django.test import Client

from apps.tasks import people, projects, services
from apps.tasks.models import Project, Task

if TYPE_CHECKING:
    from apps.accounts.models import User


def _search(client: Client, q: str) -> list[dict[str, object]]:
    response = client.get("/api/v1/tasks/search", {"q": q})
    assert response.status_code == 200
    results: list[dict[str, object]] = response.json()
    return results


def _titles(client: Client, q: str) -> list[object]:
    return [result["title"] for result in _search(client, q)]


def _task(user: User, title: str, *, description: str = "") -> Task:
    task = services.create_task(services.inbox(user), title)
    if description:
        Task.objects.filter(pk=task.pk).update(description=description)
    return task


def _comment(client: Client, task: Task, body: str) -> None:
    response = client.post(
        f"/api/v1/tasks/{task.pk}/comments",
        {"body": body},
        content_type="application/json",
    )
    assert response.status_code == 201


def _complete(client: Client, task: Task) -> None:
    response = client.patch(
        f"/api/v1/tasks/{task.pk}",
        {"status": "completed"},
        content_type="application/json",
    )
    assert response.status_code == 200


@pytest.mark.django_db
def test_search_requires_a_session() -> None:
    response = Client().get("/api/v1/tasks/search", {"q": "trip"})

    assert response.status_code == 401


@pytest.mark.django_db
@pytest.mark.parametrize("q", ["", "a", "  b  "])
def test_search_needs_at_least_two_characters(client: Client, q: str) -> None:
    response = client.get("/api/v1/tasks/search", {"q": q})

    assert response.status_code == 422


@pytest.mark.django_db
def test_search_finds_a_task_by_a_word_in_its_title(client: Client, ada: User) -> None:
    _task(ada, "Book the flights")
    _task(ada, "Water the plants")

    results = _search(client, "flight")

    assert [result["title"] for result in results] == ["Book the flights"]
    assert results[0]["match_in"] == "title"
    assert results[0]["snippet"] == "Book the flights"


@pytest.mark.django_db
def test_search_ignores_case_and_needs_every_word(client: Client, ada: User) -> None:
    _task(ada, "Book the FLIGHTS to Lisbon")
    _task(ada, "Book a table")

    assert _titles(client, "lisbon book") == ["Book the FLIGHTS to Lisbon"]


@pytest.mark.django_db
def test_search_treats_wildcards_as_plain_text(client: Client, ada: User) -> None:
    _task(ada, "Save 50% on hotels")
    _task(ada, "Save 500 on hotels")

    assert _titles(client, "50%") == ["Save 50% on hotels"]


@pytest.mark.django_db
def test_search_finds_a_task_by_its_description(client: Client, ada: User) -> None:
    _task(ada, "Trip", description="Pack the passport\n\nand the  charger")

    [result] = _search(client, "charger passport")

    assert result["match_in"] == "description"
    assert result["snippet"] == "Pack the passport and the charger"


@pytest.mark.django_db
def test_search_finds_a_task_by_one_of_its_comments(client: Client, ada: User) -> None:
    task = _task(ada, "Trip")
    _comment(client, task, "Ask about the visa")
    _comment(client, task, "The visa takes two weeks")

    [result] = _search(client, "visa weeks")

    assert result["match_in"] == "comment"
    assert result["snippet"] == "The visa takes two weeks"


@pytest.mark.django_db
def test_words_split_across_fields_dont_match(client: Client, ada: User) -> None:
    task = _task(ada, "Book flights", description="Check the baggage rules")
    _comment(client, task, "Window seat")

    assert _search(client, "flights baggage") == []
    assert _search(client, "baggage window") == []


@pytest.mark.django_db
def test_a_snippet_shows_mentions_by_name(client: Client, ada: User) -> None:
    alice = people.create_person(ada, "Alice")
    _task(ada, "Trip", description=f"Ask [@Alice](person:{alice.pk}) about the dates")

    [result] = _search(client, "dates")

    assert result["snippet"] == "Ask @Alice about the dates"


@pytest.mark.django_db
def test_a_snippet_is_cut_around_the_first_match(client: Client, ada: User) -> None:
    before, after = "word " * 40, " more" * 60
    _task(ada, "Trip", description=f"{before}passport{after}")

    [result] = _search(client, "passport")

    snippet = str(result["snippet"])
    assert snippet.startswith("…")
    assert snippet.endswith("…")
    assert "passport" in snippet
    assert len(snippet) <= 162


@pytest.mark.django_db
def test_results_rank_open_before_closed_then_title_description_comment(
    client: Client,
    ada: User,
) -> None:
    closed_title = _task(ada, "Closed title lisbon")
    _complete(client, closed_title)
    in_comment = _task(ada, "Open comment")
    _comment(client, in_comment, "Lisbon in May")
    _task(ada, "Open description", description="Fly to Lisbon")
    _task(ada, "Open title lisbon")
    closed_comment = _task(ada, "Closed comment")
    _comment(client, closed_comment, "Lisbon in June")
    _complete(client, closed_comment)

    assert _titles(client, "lisbon") == [
        "Open title lisbon",
        "Open description",
        "Open comment",
        "Closed title lisbon",
        "Closed comment",
    ]


@pytest.mark.django_db
def test_blocked_tasks_rank_with_open_ones(client: Client, ada: User) -> None:
    done = _task(ada, "Lisbon done")
    _complete(client, done)
    blocked = _task(ada, "Lisbon blocked")
    Task.objects.filter(pk=blocked.pk).update(status=Task.Status.BLOCKED)

    assert _titles(client, "lisbon") == ["Lisbon blocked", "Lisbon done"]


@pytest.mark.django_db
def test_search_includes_tasks_in_archived_projects(client: Client, ada: User) -> None:
    project = projects.create_project(ada, "Old trips")
    services.create_task(project, "Lisbon 2019")
    projects.archive_project(ada, project.pk)

    assert _titles(client, "lisbon") == ["Lisbon 2019"]


@pytest.mark.django_db
def test_search_never_returns_trashed_tasks(client: Client, ada: User) -> None:
    trashed = _task(ada, "Lisbon trashed")
    Task.objects.filter(pk=trashed.pk).update(deleted_at=datetime(2026, 10, 1, tzinfo=UTC))
    project = projects.create_project(ada, "Gone")
    services.create_task(project, "Lisbon in a trashed Project")
    Project.objects.filter(pk=project.pk).update(deleted_at=datetime(2026, 10, 1, tzinfo=UTC))

    assert _search(client, "lisbon") == []


@pytest.mark.django_db
def test_search_drops_a_task_and_its_subtasks_once_trashed(client: Client, ada: User) -> None:
    parent = _task(ada, "Lisbon trip")
    services.create_subtask(parent, "Lisbon hotel")

    assert client.delete(f"/api/v1/tasks/{parent.pk}").status_code == 204
    assert _search(client, "lisbon") == []

    assert client.post(f"/api/v1/tasks/{parent.pk}/restore").status_code == 200
    assert set(_titles(client, "lisbon")) == {"Lisbon hotel", "Lisbon trip"}


@pytest.mark.django_db
def test_search_never_returns_another_users_tasks(
    client: Client,
    ada: User,
    grace: User,
) -> None:
    _task(ada, "Ada's Lisbon trip")
    theirs = _task(grace, "Grace's Lisbon trip", description="Lisbon")
    grace_client = Client()
    grace_client.force_login(grace)
    _comment(grace_client, theirs, "Lisbon again")

    assert _titles(client, "lisbon") == ["Ada's Lisbon trip"]


@pytest.mark.django_db
def test_search_returns_at_most_fifty_tasks(client: Client, ada: User) -> None:
    Task.objects.bulk_create(
        Task(owner=ada, project=services.inbox(ada), title=f"Lisbon {n}", position=f"a{n:03}")
        for n in range(51)
    )

    assert len(_search(client, "lisbon")) == 50


@pytest.mark.django_db
def test_results_are_list_rows(client: Client, ada: User) -> None:
    task = _task(ada, "Lisbon")
    _comment(client, task, "Lisbon notes")

    [result] = _search(client, "lisbon")

    assert result["id"] == task.pk
    assert result["comment_count"] == 1
    assert result["depth"] == 0
