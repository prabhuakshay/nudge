"""Tests for the public Share link report: opened by key, without a session."""

from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta
from typing import TYPE_CHECKING
from unittest.mock import ANY

import pytest
from django.core.cache import cache
from django.test import Client

from apps.accounts.services import set_time_zone
from apps.tasks import (
    creation,
    people,
    project_trash,
    projects,
    sections,
    services,
    share_links,
    trash,
)
from apps.tasks.creation import NewTask
from apps.tasks.dates import TaskDates
from apps.tasks.models import ShareLink, Task
from apps.tasks.services import TaskEdit

if TYPE_CHECKING:
    from collections.abc import Callable, Iterator

    from django.test.client import _MonkeyPatchedWSGIResponse as Response

    from apps.accounts.models import User
    from apps.tasks.models import Project

_NOW = datetime(2026, 11, 2, 9, 30, tzinfo=UTC)
_LATER = datetime(2026, 11, 3, 18, 0, tzinfo=UTC)


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
    freeze_time(_NOW)
    return share_links.create_share_link(ada, work.pk)


def _open(key: str) -> Response:
    return Client().get(f"/api/v1/share/{key}")


def _titles(report: dict[str, list[dict[str, list[dict[str, str]]]]]) -> list[str]:
    return [task["title"] for section in report["sections"] for task in section["tasks"]]


def _close(task: Task, status: Task.Status = Task.Status.COMPLETED) -> None:
    services.update_task(task.owner, task.pk, TaskEdit(status=status))


@pytest.mark.django_db
def test_the_report_shows_the_projects_tasks_without_a_session(
    ada: User, work: Project, link: ShareLink
) -> None:
    set_time_zone(ada, "Asia/Kolkata")
    creation.create_task(work, "Write the brief")
    creation.create_task(work, "Book the venue")

    response = _open(link.key)

    assert response.status_code == 200
    report = response.json()
    assert report["project"] == {"name": "Work", "is_archived": False}
    assert report["as_of"] == "2026-11-02T15:00:00+05:30"
    assert _titles(report) == ["Book the venue", "Write the brief"]


@pytest.mark.django_db
def test_sections_come_in_list_order_with_closed_tasks_after_open_ones(
    work: Project, link: ShareLink
) -> None:
    design = sections.create_section(work, "Design")
    build = sections.create_section(work, "Build")
    creation.create_task(work, "Loose end")
    creation.create_task(work, "Lay bricks", NewTask(section=build))
    sketch = creation.create_task(work, "Sketch", NewTask(section=design, last=True))
    creation.create_task(work, "Pick colours", NewTask(section=design, last=True))
    _close(sketch)

    report = _open(link.key).json()

    assert [(s["name"], [t["title"] for t in s["tasks"]]) for s in report["sections"]] == [
        (None, ["Loose end"]),
        ("Design", ["Pick colours", "Sketch"]),
        ("Build", ["Lay bricks"]),
    ]


@pytest.mark.django_db
def test_pinned_tasks_lead_as_in_the_list(ada: User, work: Project, link: ShareLink) -> None:
    for title in ("Third", "Second", "First"):
        creation.create_task(work, title)
    for title in ("Pinned last", "Pinned first"):
        pinned = creation.create_task(work, title, NewTask(last=True))
        services.update_task(ada, pinned.pk, TaskEdit(pinned=True))

    assert _titles(_open(link.key).json()) == [
        "Pinned last",
        "Pinned first",
        "First",
        "Second",
        "Third",
    ]


@pytest.mark.django_db
def test_subtasks_follow_their_parent_with_its_title(work: Project, link: ShareLink) -> None:
    creation.create_task(work, "Last", NewTask(last=True))
    plan = creation.create_task(work, "Plan")
    outline = creation.create_subtask(plan, "Outline").task
    creation.create_subtask(outline, "Headings")
    creation.create_subtask(plan, "Review")

    tasks = _open(link.key).json()["sections"][0]["tasks"]

    assert [(t["parent_title"], t["title"]) for t in tasks] == [
        (None, "Plan"),
        ("Plan", "Outline"),
        ("Outline", "Headings"),
        ("Plan", "Review"),
        (None, "Last"),
    ]


@pytest.mark.django_db
def test_open_tasks_show_however_old_and_closed_ones_only_if_closed_within_the_range(
    ada: User, work: Project, freeze_time: Callable[[datetime], None]
) -> None:
    freeze_time(_NOW - timedelta(days=400))
    creation.create_task(work, "Untouched for a year")
    _close(creation.create_task(work, "Done long ago"))
    freeze_time(_NOW - timedelta(days=15))
    _close(creation.create_task(work, "Done 15 days ago"))
    freeze_time(_NOW - timedelta(days=13))
    _close(creation.create_task(work, "Dropped 13 days ago"), Task.Status.WONT_DO)
    freeze_time(_NOW)
    fortnight = share_links.create_share_link(ada, work.pk)
    everything = share_links.create_share_link(ada, work.pk)
    ShareLink.objects.filter(pk=everything.pk).update(range_days=None)

    assert _titles(_open(fortnight.key).json()) == ["Untouched for a year", "Dropped 13 days ago"]
    assert _titles(_open(everything.key).json()) == [
        "Untouched for a year",
        "Dropped 13 days ago",
        "Done 15 days ago",
        "Done long ago",
    ]


@pytest.mark.django_db
def test_a_closed_subtask_under_open_work_follows_the_range_too(
    work: Project, link: ShareLink, freeze_time: Callable[[datetime], None]
) -> None:
    freeze_time(_NOW - timedelta(days=30))
    plan = creation.create_task(work, "Plan")
    _close(creation.create_subtask(plan, "Old step").task)
    freeze_time(_NOW)
    _close(creation.create_subtask(plan, "New step").task)

    assert _titles(_open(link.key).json()) == ["Plan", "New step"]


@pytest.mark.django_db
def test_each_task_shows_its_details_with_mentions_as_names(
    ada: User, work: Project, link: ShareLink
) -> None:
    grace = people.create_person(ada, "Grace")
    task = creation.create_task(
        work,
        f"Call [@Grace](person:{grace.pk})",
        NewTask(
            description=f"Ask [@Grace](person:{grace.pk}) about **dates**",
            dates=TaskDates(
                due_date=date(2026, 11, 20),
                due_time=time(17, 0),
                start_date=date(2026, 11, 18),
                start_time=time(9, 0),
            ),
            priority=Task.Priority.P1,
            tags=["client", "urgent"],
        ),
    )
    services.update_task(
        ada,
        task.pk,
        TaskEdit(
            status=Task.Status.BLOCKED, blocked_reason=f"Waiting on [@Grace](person:{grace.pk})"
        ),
    )

    shown = _open(link.key).json()["sections"][0]["tasks"][0]

    assert shown == {
        "id": task.pk,
        "title": "Call Grace",
        "parent_title": None,
        "status": "blocked",
        "priority": 1,
        "due_date": "2026-11-20",
        "due_time": "17:00:00",
        "start_date": "2026-11-18",
        "start_time": "09:00:00",
        "completed_at": None,
        "is_overdue": False,
        "tags": ["client", "urgent"],
        "description": "Ask Grace about **dates**",
        "blocked_reason": "Waiting on Grace",
        "attachments": [],
        "timeline": ANY,
    }


@pytest.mark.django_db
def test_dates_are_on_the_owners_clock(
    ada: User, work: Project, link: ShareLink, freeze_time: Callable[[datetime], None]
) -> None:
    set_time_zone(ada, "America/Los_Angeles")
    due = TaskDates(due_date=date(2026, 11, 1), due_time=time(23, 0))
    creation.create_task(work, "Due last night", NewTask(dates=due))
    freeze_time(datetime(2026, 11, 2, 4, 0, tzinfo=UTC))
    _close(creation.create_task(work, "Closed in the evening"))

    tasks = _open(link.key).json()["sections"][0]["tasks"]

    assert [(t["title"], t["due_time"], t["completed_at"]) for t in tasks] == [
        ("Due last night", "23:00:00", None),
        ("Closed in the evening", None, "2026-11-01T20:00:00-08:00"),
    ]


@pytest.mark.django_db
def test_the_summary_counts_completed_out_of_all_shown_blocked_and_overdue(
    ada: User, work: Project, link: ShareLink
) -> None:
    yesterday = TaskDates(due_date=date(2026, 11, 1))
    creation.create_task(work, "Late", NewTask(dates=yesterday))
    stuck = creation.create_task(work, "Stuck", NewTask(dates=yesterday))
    services.update_task(ada, stuck.pk, TaskEdit(status=Task.Status.BLOCKED))
    plan = creation.create_task(work, "Plan")
    _close(creation.create_subtask(plan, "Step").task)
    _close(creation.create_task(work, "Shipped"))
    _close(creation.create_task(work, "Dropped"), Task.Status.WONT_DO)
    trash.trash_task(ada, creation.create_task(work, "Thrown away").pk)

    summary = _open(link.key).json()["summary"]

    assert summary == {"completed": 2, "total": 6, "blocked": 1, "overdue": 2}


@pytest.mark.django_db
def test_opening_the_report_records_when(
    client: Client, work: Project, link: ShareLink, freeze_time: Callable[[datetime], None]
) -> None:
    freeze_time(_LATER)

    _open(link.key)

    listed = client.get(f"/api/v1/projects/{work.pk}/share-links").json()
    assert listed[0]["last_opened_at"] == "2026-11-03T18:00:00Z"


@pytest.mark.django_db
def test_trashed_tasks_are_left_out(ada: User, work: Project, link: ShareLink) -> None:
    creation.create_task(work, "Kept")
    trash.trash_task(ada, creation.create_task(work, "Thrown away").pk)

    assert _titles(_open(link.key).json()) == ["Kept"]


@pytest.mark.django_db
def test_a_link_to_an_archived_project_keeps_working(
    ada: User, work: Project, link: ShareLink
) -> None:
    creation.create_task(work, "Wrap up")
    projects.archive_project(ada, work.pk)

    response = _open(link.key)

    assert response.status_code == 200
    assert response.json()["project"] == {"name": "Work", "is_archived": True}
    assert _titles(response.json()) == ["Wrap up"]


@pytest.mark.django_db
def test_search_engines_are_told_not_to_index_any_answer(link: ShareLink) -> None:
    link.stopped_at = _NOW
    link.save()

    for key in (link.key, "not-a-real-key"):
        assert _open(key)["X-Robots-Tag"] == "noindex"


@pytest.mark.django_db
def test_an_unknown_key_is_not_found() -> None:
    response = _open("not-a-real-key")

    assert response.status_code == 404


@pytest.mark.django_db
def test_a_stopped_link_is_no_longer_active(client: Client, link: ShareLink) -> None:
    client.post(f"/api/v1/share-links/{link.pk}/stop")

    _assert_no_longer_active(link)


@pytest.mark.django_db
def test_an_expired_link_is_no_longer_active(
    link: ShareLink, freeze_time: Callable[[datetime], None]
) -> None:
    freeze_time(_NOW + timedelta(days=7))

    _assert_no_longer_active(link)


@pytest.mark.django_db
def test_a_link_works_until_it_expires(
    link: ShareLink, freeze_time: Callable[[datetime], None]
) -> None:
    freeze_time(_NOW + timedelta(days=7, seconds=-1))

    assert _open(link.key).status_code == 200


@pytest.mark.django_db
def test_a_link_without_an_expiry_never_expires(
    link: ShareLink, freeze_time: Callable[[datetime], None]
) -> None:
    ShareLink.objects.filter(pk=link.pk).update(expires_at=None)
    freeze_time(_NOW + timedelta(days=3650))

    assert _open(link.key).status_code == 200


@pytest.mark.django_db
def test_a_link_to_a_project_in_trash_is_no_longer_active(
    ada: User, work: Project, link: ShareLink
) -> None:
    project_trash.trash_project(ada, work.pk)

    _assert_no_longer_active(link)


def _assert_no_longer_active(link: ShareLink) -> None:
    """The answer says only that the link is inactive, and the visit isn't recorded."""
    response = _open(link.key)

    assert response.status_code == 410
    assert response.json() == {"detail": "This link is no longer active."}
    link.refresh_from_db()
    assert link.last_opened_at is None
