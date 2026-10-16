"""Tests that Pinned Tasks come first in the views that span Projects."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING

import pytest

from apps.tasks import people, tags

if TYPE_CHECKING:
    from collections.abc import Callable

    from django.test import Client

    from apps.accounts.models import User

NOON = datetime(2026, 10, 15, 12, tzinfo=UTC)


def _add(client: Client, title: str, **fields: object) -> int:
    response = client.post(
        "/api/v1/tasks",
        {"title": title, **fields},
        content_type="application/json",
    )
    assert response.status_code == 201
    task_id: int = response.json()["id"]
    return task_id


def _pin(client: Client, task_id: int) -> None:
    response = client.patch(
        f"/api/v1/tasks/{task_id}",
        {"pinned": True},
        content_type="application/json",
    )
    assert response.status_code == 200


def _titles(client: Client, query: str) -> list[str]:
    response = client.get(f"/api/v1/tasks?{query}")
    assert response.status_code == 200
    return [item["title"] for item in response.json()["items"]]


@pytest.mark.django_db
@pytest.mark.parametrize(("view", "due"), [("today", "2026-10-15"), ("upcoming", "2026-10-16")])
def test_a_pinned_task_comes_first_in_today_and_upcoming(
    client: Client,
    freeze_time: Callable[[datetime], None],
    view: str,
    due: str,
) -> None:
    freeze_time(NOON)
    _add(client, "Urgent", dates={"due_date": due}, priority=1)
    _pin(client, _add(client, "Pinned", dates={"due_date": due}))

    assert _titles(client, f"view={view}") == ["Pinned", "Urgent"]


@pytest.mark.django_db
def test_a_pinned_task_comes_first_in_a_tag(client: Client, ada: User) -> None:
    work = tags.create_tag(ada, "work")
    pinned = _add(client, "Pinned", tag_ids=[work.pk])
    _add(client, "Newer", tag_ids=[work.pk])
    _pin(client, pinned)

    assert _titles(client, f"tag={work.pk}") == ["Pinned", "Newer"]


@pytest.mark.django_db
def test_a_pinned_task_comes_first_for_a_person(client: Client, ada: User) -> None:
    priya = people.create_person(ada, "Priya")
    mention = f"[@Priya](person:{priya.pk})"
    pinned = _add(client, f"Call {mention}")
    _add(client, f"Email {mention}")
    _pin(client, pinned)

    assert _titles(client, f"person={priya.pk}") == [f"Call {mention}", f"Email {mention}"]
