"""Tests for each Task's Comments on the public Share link report."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

import pytest
from django.core.cache import cache
from django.test import Client

from apps.accounts.services import set_time_zone
from apps.tasks import comments, creation, people, projects, services, share_links
from apps.tasks.models import ShareLink, Task
from apps.tasks.services import TaskEdit

if TYPE_CHECKING:
    from collections.abc import Callable, Iterator

    from apps.accounts.models import User
    from apps.tasks.models import Project

_NOW = datetime(2026, 11, 2, 9, 30, tzinfo=UTC)


@pytest.fixture(autouse=True)
def _reset_rate_limits() -> Iterator[None]:
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def work(ada: User) -> Project:
    return projects.create_project(ada, "Work")


@pytest.fixture
def link(ada: User, work: Project, freeze_time: Callable[[datetime], None]) -> ShareLink:
    set_time_zone(ada, "UTC")
    freeze_time(_NOW)
    return share_links.create_share_link(ada, work.pk)


def _comments(link: ShareLink) -> list[dict[str, object]]:
    report = Client().get(f"/api/v1/share/{link.key}").json()
    found: list[dict[str, object]] = report["sections"][0]["tasks"][0]["comments"]
    return found


@pytest.mark.django_db
def test_a_task_shows_its_comments_oldest_first_and_no_activity(
    ada: User, work: Project, link: ShareLink, freeze_time: Callable[[datetime], None]
) -> None:
    freeze_time(_NOW - timedelta(days=2))
    task = creation.create_task(work, "Plan")
    first = comments.add_comment(ada, task.pk, "First thoughts")
    services.update_task(ada, task.pk, TaskEdit(priority=Task.Priority.P2))
    freeze_time(_NOW)
    last = comments.add_comment(ada, task.pk, "All **done**")

    assert _comments(link) == [
        {"id": first.pk, "at": "2026-10-31T09:30:00Z", "body": "First thoughts"},
        {"id": last.pk, "at": "2026-11-02T09:30:00Z", "body": "All **done**"},
    ]


@pytest.mark.django_db
def test_comments_older_than_the_range_are_left_out_unless_it_is_all(
    ada: User, work: Project, link: ShareLink, freeze_time: Callable[[datetime], None]
) -> None:
    freeze_time(_NOW - timedelta(days=20))
    task = creation.create_task(work, "Plan")
    comments.add_comment(ada, task.pk, "Too old")
    freeze_time(_NOW - timedelta(days=13))
    comments.add_comment(ada, task.pk, "Recent")
    everything = share_links.create_share_link(ada, work.pk)
    ShareLink.objects.filter(pk=everything.pk).update(range_days=None, expires_at=None)
    everything.refresh_from_db()
    freeze_time(_NOW)

    assert [entry["body"] for entry in _comments(link)] == ["Recent"]
    assert [entry["body"] for entry in _comments(everything)] == ["Too old", "Recent"]


@pytest.mark.django_db
def test_mentions_read_as_the_persons_current_name(
    ada: User, work: Project, link: ShareLink
) -> None:
    grace = people.create_person(ada, "Gracie")
    task = creation.create_task(work, "Plan")
    comments.add_comment(ada, task.pk, f"Ask [@Gracie](person:{grace.pk}) first")
    people.update_person(ada, grace.pk, name="Grace")

    assert [entry["body"] for entry in _comments(link)] == ["Ask Grace first"]


@pytest.mark.django_db
def test_comment_times_are_on_the_owners_clock(ada: User, work: Project, link: ShareLink) -> None:
    set_time_zone(ada, "America/Los_Angeles")
    task = creation.create_task(work, "Plan")
    comments.add_comment(ada, task.pk, "Started")

    assert [entry["at"] for entry in _comments(link)] == ["2026-11-02T01:30:00-08:00"]
