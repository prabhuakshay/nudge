"""Tests for a Share link's Attachments: listed on the report and downloaded without a session."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

import pytest
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client

from apps.tasks import (
    attachments,
    creation,
    project_trash,
    projects,
    services,
    share_links,
    trash,
)

if TYPE_CHECKING:
    from collections.abc import Callable, Iterator

    from django.test.client import _MonkeyPatchedWSGIResponse as Response

    from apps.accounts.models import User
    from apps.tasks.models import Attachment, Project, ShareLink, Task

pytestmark = pytest.mark.usefixtures("stored_files")

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
    freeze_time(_NOW)
    return share_links.create_share_link(ada, work.pk)


def _attach(task: Task, name: str = "brief.txt", content: bytes = b"data") -> Attachment:
    return attachments.attach_file(task.owner, task.pk, SimpleUploadedFile(name, content))


def _download(key: str, attachment_id: int) -> tuple[Response, bytes]:
    response = Client().get(f"/api/v1/share/{key}/attachments/{attachment_id}")
    content = response.getvalue()
    response.close()
    return response, content


@pytest.mark.django_db
def test_the_report_lists_each_tasks_attachments_oldest_first(
    work: Project, link: ShareLink
) -> None:
    creation.create_task(work, "Bare")
    task = creation.create_task(work, "Write the brief")
    brief = _attach(task, "brief.pdf", b"12345")
    notes = _attach(task, "notes.txt", b"12")

    tasks = Client().get(f"/api/v1/share/{link.key}").json()["sections"][0]["tasks"]

    assert [(t["title"], t["attachments"]) for t in tasks] == [
        (
            "Write the brief",
            [
                {"id": brief.pk, "name": "brief.pdf", "size": 5},
                {"id": notes.pk, "name": "notes.txt", "size": 2},
            ],
        ),
        ("Bare", []),
    ]


@pytest.mark.django_db
def test_an_active_link_serves_an_attachment_in_its_project(work: Project, link: ShareLink) -> None:
    task = creation.create_task(work, "Write the brief")
    creation.create_subtask(task, "Outline")
    attachment = _attach(task, "page.html", b"<script>")

    response, content = _download(link.key, attachment.pk)

    assert response.status_code == 200
    assert content == b"<script>"
    assert response["Content-Type"] == "text/html"
    assert response["Content-Disposition"] == 'attachment; filename="page.html"'
    assert response["X-Content-Type-Options"] == "nosniff"
    assert response["Content-Security-Policy"] == "sandbox"
    assert response["X-Robots-Tag"] == "noindex"


@pytest.mark.django_db
def test_images_and_pdfs_open_inline(work: Project, link: ShareLink) -> None:
    attachment = _attach(creation.create_task(work, "Scan"), "scan.pdf")

    response, _content = _download(link.key, attachment.pk)

    assert response["Content-Disposition"] == 'inline; filename="scan.pdf"'


@pytest.mark.django_db
def test_a_subtasks_attachment_is_served(work: Project, link: ShareLink) -> None:
    parent = creation.create_task(work, "Plan")
    attachment = _attach(creation.create_subtask(parent, "Outline").task)

    response, _content = _download(link.key, attachment.pk)

    assert response.status_code == 200


@pytest.mark.django_db
def test_an_attachment_in_another_project_is_not_found(ada: User, link: ShareLink) -> None:
    home = projects.create_project(ada, "Home")
    attachment = _attach(creation.create_task(home, "Pay rent"))

    response, _content = _download(link.key, attachment.pk)

    assert response.status_code == 404


@pytest.mark.django_db
def test_an_attachment_in_the_inbox_is_not_found(ada: User, link: ShareLink) -> None:
    attachment = _attach(creation.create_task(services.inbox(ada), "Private"))

    response, _content = _download(link.key, attachment.pk)

    assert response.status_code == 404


@pytest.mark.django_db
def test_another_users_attachment_is_not_found(grace: User, link: ShareLink) -> None:
    theirs = projects.create_project(grace, "Work")
    attachment = _attach(creation.create_task(theirs, "Secret"))

    response, _content = _download(link.key, attachment.pk)

    assert response.status_code == 404


@pytest.mark.django_db
def test_an_attachment_on_a_trashed_task_is_not_found(
    ada: User, work: Project, link: ShareLink
) -> None:
    task = creation.create_task(work, "Thrown away")
    attachment = _attach(task)
    trash.trash_task(ada, task.pk)

    response, _content = _download(link.key, attachment.pk)

    assert response.status_code == 404


@pytest.mark.django_db
def test_an_attachment_under_a_trashed_parent_is_not_found(
    ada: User, work: Project, link: ShareLink
) -> None:
    parent = creation.create_task(work, "Thrown away")
    attachment = _attach(creation.create_subtask(parent, "Outline").task)
    trash.trash_task(ada, parent.pk)

    response, _content = _download(link.key, attachment.pk)

    assert response.status_code == 404


@pytest.mark.django_db
def test_an_unknown_key_is_not_found(work: Project) -> None:
    attachment = _attach(creation.create_task(work, "Write the brief"))

    response, _content = _download("not-a-real-key", attachment.pk)

    assert response.status_code == 404
    assert response["X-Robots-Tag"] == "noindex"


@pytest.mark.django_db
def test_a_stopped_link_is_not_found(ada: User, work: Project, link: ShareLink) -> None:
    attachment = _attach(creation.create_task(work, "Write the brief"))
    share_links.stop_share_link(ada, link.pk)

    response, _content = _download(link.key, attachment.pk)

    assert response.status_code == 404


@pytest.mark.django_db
def test_an_expired_link_is_not_found(
    work: Project, link: ShareLink, freeze_time: Callable[[datetime], None]
) -> None:
    attachment = _attach(creation.create_task(work, "Write the brief"))
    freeze_time(_NOW + timedelta(days=7))

    response, _content = _download(link.key, attachment.pk)

    assert response.status_code == 404


@pytest.mark.django_db
def test_a_link_to_a_project_in_trash_is_not_found(
    ada: User, work: Project, link: ShareLink
) -> None:
    attachment = _attach(creation.create_task(work, "Write the brief"))
    project_trash.trash_project(ada, work.pk)

    response, _content = _download(link.key, attachment.pk)

    assert response.status_code == 404
