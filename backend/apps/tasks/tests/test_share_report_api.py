"""Tests for the public Share link report: opened by key, without a session."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

import pytest
from django.core.cache import cache
from django.test import Client

from apps.accounts.services import set_time_zone
from apps.tasks import creation, project_trash, projects, share_links, trash
from apps.tasks.models import ShareLink, Task

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


@pytest.mark.django_db
def test_the_report_shows_the_projects_open_tasks_without_a_session(
    ada: User, work: Project, link: ShareLink
) -> None:
    set_time_zone(ada, "Asia/Kolkata")
    creation.create_task(work, "Write the brief")
    creation.create_task(work, "Book the venue")
    done = creation.create_task(work, "Pick a date")
    Task.objects.filter(pk=done.pk).update(status=Task.Status.COMPLETED, completed_at=_NOW)

    response = _open(link.key)

    assert response.status_code == 200
    report = response.json()
    assert report["project"] == {"name": "Work", "is_archived": False}
    assert report["as_of"] == "2026-11-02T15:00:00+05:30"
    assert _titles(report) == ["Book the venue", "Write the brief"]


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
