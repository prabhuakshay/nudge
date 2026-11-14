"""Tests for each Task's timeline on the public Share link report: its Comments and Activity."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

import pytest
from django.core.cache import cache
from django.test import Client

from apps.accounts.services import set_time_zone
from apps.tasks import comments, creation, people, projects, services, share_links
from apps.tasks.models import ShareLink, Task, TaskActivity
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


def _stamp(task: Task, kind: TaskActivity.Kind, at: datetime) -> None:
    """Date the Task's events of this kind, since Activity doesn't follow `freeze_time`."""
    TaskActivity.objects.filter(task=task, kind=kind).update(at=at)


def _timeline(link: ShareLink) -> list[dict[str, object]]:
    report = Client().get(f"/api/v1/share/{link.key}").json()
    timeline: list[dict[str, object]] = report["sections"][0]["tasks"][0]["timeline"]
    return timeline


@pytest.mark.django_db
def test_a_tasks_timeline_merges_comments_and_activity_oldest_first(
    ada: User, work: Project, link: ShareLink, freeze_time: Callable[[datetime], None]
) -> None:
    freeze_time(_NOW - timedelta(days=3))
    task = creation.create_task(work, "Plan")
    _stamp(task, TaskActivity.Kind.CREATED, _NOW - timedelta(days=3))
    freeze_time(_NOW - timedelta(days=2))
    first = comments.add_comment(ada, task.pk, "First thoughts")
    freeze_time(_NOW - timedelta(days=1))
    services.update_task(ada, task.pk, TaskEdit(priority=Task.Priority.P2))
    _stamp(task, TaskActivity.Kind.PRIORITY_CHANGED, _NOW - timedelta(days=1))
    freeze_time(_NOW)
    last = comments.add_comment(ada, task.pk, "All **done**")

    timeline = _timeline(link)

    assert [(entry["kind"], entry["at"]) for entry in timeline] == [
        ("created", "2026-10-30T09:30:00Z"),
        ("comment", "2026-10-31T09:30:00Z"),
        ("priority_changed", "2026-11-01T09:30:00Z"),
        ("comment", "2026-11-02T09:30:00Z"),
    ]
    assert timeline[1] == {
        "kind": "comment",
        "id": first.pk,
        "at": "2026-10-31T09:30:00Z",
        "body": "First thoughts",
    }
    assert timeline[2]["data"] == {"old": 0, "new": 2}
    assert timeline[3] == {
        "kind": "comment",
        "id": last.pk,
        "at": "2026-11-02T09:30:00Z",
        "body": "All **done**",
    }


@pytest.mark.django_db
def test_entries_older_than_the_range_are_left_out_unless_it_is_all(
    ada: User, work: Project, link: ShareLink, freeze_time: Callable[[datetime], None]
) -> None:
    freeze_time(_NOW - timedelta(days=20))
    task = creation.create_task(work, "Plan")
    _stamp(task, TaskActivity.Kind.CREATED, _NOW - timedelta(days=20))
    comments.add_comment(ada, task.pk, "Too old")
    freeze_time(_NOW - timedelta(days=13))
    comments.add_comment(ada, task.pk, "Recent")
    everything = share_links.create_share_link(ada, work.pk)
    ShareLink.objects.filter(pk=everything.pk).update(range_days=None, expires_at=None)
    everything.refresh_from_db()
    freeze_time(_NOW)

    assert [entry.get("body") for entry in _timeline(link)] == ["Recent"]
    assert [entry.get("body") for entry in _timeline(everything)] == [None, "Too old", "Recent"]


_DATES = {"due_date": "2026-11-20", "due_time": "17:00:00", "start_date": None, "start_time": None}
_REPEAT: dict[str, object] = {"rule": "FREQ=WEEKLY", "repeat_from": "due"}
_STATUS = {"via_parent": None, "via_subtask": None, "closed_subtasks": 0}
_MOVED = {"from_parent": None, "to_parent": None, "from_section": None, "to_section": "Build"}
_EVERY_KIND: dict[str, dict[str, object]] = {
    "created": {},
    "title_changed": {"old": "Plan", "new": "Plan the launch"},
    "description_edited": {},
    "dates_changed": {"old": None, "new": _DATES},
    "status_changed": {"old": "open", "new": "blocked", "blocked_reason": "Budget", **_STATUS},
    "priority_changed": {"old": 0, "new": 1},
    "pinned": {},
    "unpinned": {},
    "countdown_marked": {},
    "countdown_unmarked": {},
    "attachment_added": {"name": "brief.pdf"},
    "attachment_removed": {"name": "brief.pdf"},
    "moved": {"from_project": "Home", "to_project": "Work", **_MOVED},
    "tag_added": {"name": "client"},
    "tag_removed": {"name": "client"},
    "tags_merged": {"from_tag": "clients", "into_tag": "client"},
    "person_merged": {"from_person": "Gracie", "to_person": "Grace"},
    "reminders_changed": {"old": [], "new": [0, 3600], "all_day": False},
    "repeat_changed": {"old": None, "new": _REPEAT},
    "repeat_removed": _REPEAT,
    "repeat_advanced": {"action": "completed", "occurrence": "2026-11-20", "next": "2026-11-27"},
    "trashed": {},
    "restored": {},
}


@pytest.mark.django_db
def test_every_kind_of_activity_is_shown_with_its_details(work: Project, link: ShareLink) -> None:
    task = creation.create_task(work, "Plan")
    task.activity.all().delete()
    for minute, (kind, data) in enumerate(_EVERY_KIND.items()):
        TaskActivity.objects.create(
            task=task, kind=kind, data=data, at=_NOW - timedelta(minutes=60 - minute)
        )

    timeline = _timeline(link)

    assert {entry["kind"] for entry in timeline} == set(TaskActivity.Kind.values)
    assert {str(entry["kind"]): entry["data"] for entry in timeline} == _EVERY_KIND


@pytest.mark.django_db
def test_mentions_read_as_the_persons_current_name(
    ada: User, work: Project, link: ShareLink
) -> None:
    grace = people.create_person(ada, "Gracie")
    alan = people.create_person(ada, "Alan")
    title = f"Call [@Gracie](person:{grace.pk}) and [@Alan](person:{alan.pk})"
    task = creation.create_task(work, title)
    services.update_task(ada, task.pk, TaskEdit(title="Call everyone"))
    comments.add_comment(ada, task.pk, f"Ask [@Gracie](person:{grace.pk}) first")
    people.update_person(ada, grace.pk, name="Grace")
    people.delete_person(ada, alan.pk)

    by_kind = {entry["kind"]: entry for entry in _timeline(link)}

    renamed = {"old": "Call Grace and Alan", "new": "Call everyone"}
    assert by_kind["title_changed"]["data"] == renamed
    assert by_kind["comment"]["body"] == "Ask Grace first"


@pytest.mark.django_db
def test_timeline_times_are_on_the_owners_clock(ada: User, work: Project, link: ShareLink) -> None:
    set_time_zone(ada, "America/Los_Angeles")
    task = creation.create_task(work, "Plan")
    _stamp(task, TaskActivity.Kind.CREATED, _NOW - timedelta(hours=1))
    comments.add_comment(ada, task.pk, "Started")

    assert [entry["at"] for entry in _timeline(link)] == [
        "2026-11-02T00:30:00-08:00",
        "2026-11-02T01:30:00-08:00",
    ]
