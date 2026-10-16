"""Tests for putting moved Tasks back where they were, as Undo of a bulk move does."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from apps.tasks import creation, projects, sections, services
from apps.tasks.models import Task

if TYPE_CHECKING:
    from django.test import Client
    from django.test.client import _MonkeyPatchedWSGIResponse as Response

    from apps.accounts.models import User


def _bulk(client: Client, ids: list[object], action: dict[str, object]) -> Response:
    return client.post(
        "/api/v1/tasks/bulk",
        {"ids": ids, "action": action},
        content_type="application/json",
    )


def _place(client: Client, places: list[dict[str, object]]) -> Response:
    ids = [place["id"] for place in places]
    return _bulk(client, ids, {"kind": "place", "places": places})


def _roots(project_id: int) -> list[str]:
    roots = Task.objects.filter(project_id=project_id, parent__isnull=True)
    return list(roots.order_by("position", "id").values_list("title", flat=True))


def _subtasks(parent: Task) -> list[str]:
    return list(parent.subtasks.order_by("position", "id").values_list("title", flat=True))


@pytest.mark.django_db
def test_a_bulk_move_says_where_each_task_was(client: Client, ada: User) -> None:
    inbox = services.inbox(ada)
    work = projects.create_project(ada, "Work")
    for title in ("Last", "Middle", "First"):
        creation.create_task(inbox, title)
    first, middle = Task.objects.get(title="First"), Task.objects.get(title="Middle")

    response = _bulk(client, [middle.pk, first.pk], {"kind": "move", "project_id": work.pk})

    assert response.json()["moved_from"] == [
        {
            "id": first.pk,
            "project_id": inbox.pk,
            "parent_id": None,
            "after_id": None,
            "section_id": None,
        },
        {
            "id": middle.pk,
            "project_id": inbox.pk,
            "parent_id": None,
            "after_id": first.pk,
            "section_id": None,
        },
    ]


@pytest.mark.django_db
def test_placing_puts_moved_tasks_back_in_their_old_places(client: Client, ada: User) -> None:
    inbox = services.inbox(ada)
    work = projects.create_project(ada, "Work")
    for title in ("Last", "Middle", "First"):
        creation.create_task(inbox, title)
    trip = creation.create_task(inbox, "Trip")
    for title in ("Flights", "Hotel", "Visa"):
        creation.create_subtask(trip, title)
    middle, first = Task.objects.get(title="Middle"), Task.objects.get(title="First")
    hotel = Task.objects.get(title="Hotel")
    moved = _bulk(client, [middle.pk, hotel.pk, first.pk], {"kind": "move", "project_id": work.pk})

    response = _place(client, moved.json()["moved_from"])

    assert response.status_code == 200
    assert _roots(inbox.pk) == ["Trip", "First", "Middle", "Last"]
    assert _subtasks(trip) == ["Flights", "Hotel", "Visa"]
    assert _roots(work.pk) == []


@pytest.mark.django_db
def test_placing_puts_moved_tasks_back_in_their_old_sections(client: Client, ada: User) -> None:
    work = projects.create_project(ada, "Work")
    home = projects.create_project(ada, "Home")
    to_do = sections.create_section(work, "To do")
    loose = creation.create_task(work, "Loose")
    grouped = creation.create_task(work, "Grouped", creation.NewTask(section=to_do))
    moved = _bulk(client, [grouped.pk, loose.pk], {"kind": "move", "project_id": home.pk})

    response = _place(client, moved.json()["moved_from"])

    assert response.status_code == 200
    rows = Task.objects.filter(project=work).order_by("position", "id")
    assert list(rows.values_list("title", "section_id")) == [
        ("Grouped", to_do.pk),
        ("Loose", None),
    ]


@pytest.mark.django_db
def test_placing_into_another_users_section_is_404(client: Client, ada: User, grace: User) -> None:
    inbox = services.inbox(ada)
    task = creation.create_task(inbox, "Pay rent")
    theirs = sections.create_section(projects.create_project(grace, "Theirs"), "To do")
    place = {
        "id": task.pk,
        "project_id": inbox.pk,
        "parent_id": None,
        "after_id": None,
        "section_id": None,
    }

    response = _place(client, [{**place, "section_id": theirs.pk}])

    assert response.status_code == 404
    assert Task.objects.get(pk=task.pk).section_id is None


@pytest.mark.django_db
def test_placing_into_another_users_project_is_404(
    client: Client,
    ada: User,
    grace: User,
) -> None:
    task = creation.create_task(services.inbox(ada), "Pay rent")
    theirs = services.inbox(grace)

    response = _place(
        client,
        [
            {
                "id": task.pk,
                "project_id": theirs.pk,
                "parent_id": None,
                "after_id": None,
                "section_id": None,
            }
        ],
    )

    assert response.status_code == 404
    assert Task.objects.get(pk=task.pk).project_id == services.inbox(ada).pk


@pytest.mark.django_db
def test_placing_under_another_users_task_is_404(client: Client, ada: User, grace: User) -> None:
    inbox = services.inbox(ada)
    task = creation.create_task(inbox, "Pay rent")
    theirs = creation.create_task(services.inbox(grace), "Buy milk")

    response = _place(
        client,
        [
            {
                "id": task.pk,
                "project_id": inbox.pk,
                "parent_id": theirs.pk,
                "after_id": None,
                "section_id": None,
            }
        ],
    )

    assert response.status_code == 404
    assert Task.objects.get(pk=task.pk).parent_id is None


@pytest.mark.django_db
def test_places_must_name_the_tasks_given(client: Client, ada: User) -> None:
    inbox = services.inbox(ada)
    task = creation.create_task(inbox, "Pay rent")
    other = creation.create_task(inbox, "Buy milk")
    place = {
        "id": task.pk,
        "project_id": inbox.pk,
        "parent_id": None,
        "after_id": None,
        "section_id": None,
    }

    response = _bulk(client, [other.pk], {"kind": "place", "places": [place]})

    assert response.status_code == 422
