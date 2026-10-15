"""Tests for the Attachment endpoints: upload, list, download and delete."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client

from apps.tasks import services
from apps.tasks.models import Attachment

if TYPE_CHECKING:
    from pathlib import Path

    from django.test.client import _MonkeyPatchedWSGIResponse as Response
    from pytest_django import Settings
    from pytest_django.fixtures import DjangoCaptureOnCommitCallbacks

    from apps.accounts.models import User
    from apps.tasks.models import Task


@pytest.fixture(autouse=True)
def media_root(settings: Settings, tmp_path: Path) -> Path:
    settings.MEDIA_ROOT = tmp_path
    settings.FILE_UPLOAD_TEMP_DIR = tmp_path / "uploads"
    settings.FILE_UPLOAD_TEMP_DIR.mkdir()
    return tmp_path


@pytest.fixture
def task(ada: User) -> Task:
    return services.create_task(services.inbox(ada), "File the taxes")


def _upload(client: Client, task_id: int, name: str, content: bytes = b"data") -> Response:
    return client.post(
        f"/api/v1/tasks/{task_id}/attachments",
        {"file": SimpleUploadedFile(name, content, content_type="text/html")},
    )


def _download(client: Client, attachment_id: int) -> tuple[Response, bytes]:
    response = client.get(f"/api/v1/attachments/{attachment_id}/download")
    content = response.getvalue()
    response.close()
    return response, content


def _stored_files(media_root: Path) -> list[Path]:
    return [path for path in media_root.rglob("*") if path.is_file()]


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("post", "/api/v1/tasks/1/attachments"),
        ("get", "/api/v1/tasks/1/attachments"),
        ("get", "/api/v1/attachments/1/download"),
        ("delete", "/api/v1/attachments/1"),
    ],
)
def test_every_attachment_endpoint_requires_a_session(method: str, path: str) -> None:
    response = getattr(Client(), method)(path)

    assert response.status_code == 401


@pytest.mark.django_db
def test_upload_keeps_the_name_and_size_and_picks_the_type_from_the_name(
    client: Client,
    task: Task,
) -> None:
    response = _upload(client, task.pk, "receipt.png", b"12345")

    assert response.status_code == 201
    body = response.json()
    assert body == {
        "id": body["id"],
        "name": "receipt.png",
        "size": 5,
        "content_type": "image/png",
        "created_at": body["created_at"],
    }


@pytest.mark.django_db
def test_upload_stores_the_file_under_a_generated_key(
    client: Client,
    task: Task,
    media_root: Path,
) -> None:
    _upload(client, task.pk, "../../etc/passwd")

    [stored] = _stored_files(media_root)
    assert stored.read_bytes() == b"data"
    assert "passwd" not in str(stored)
    assert stored.is_relative_to(media_root / "attachments")


@pytest.mark.django_db
def test_upload_of_an_unknown_type_is_stored_as_plain_bytes(client: Client, task: Task) -> None:
    response = _upload(client, task.pk, "notes.unknownext")

    assert response.json()["content_type"] == "application/octet-stream"


@pytest.mark.django_db
def test_upload_over_the_size_limit_is_refused(
    client: Client,
    task: Task,
    settings: Settings,
    media_root: Path,
) -> None:
    settings.ATTACHMENT_MAX_SIZE = 25 * 1024 * 1024

    response = _upload(client, task.pk, "big.bin", b"x" * (25 * 1024 * 1024 + 1))

    assert response.status_code == 413
    assert response.json() == {"detail": "Files can be at most 25.0\xa0MB."}
    assert _stored_files(media_root) == []
    assert not Attachment.objects.exists()


@pytest.mark.django_db
def test_upload_at_the_size_limit_is_accepted(
    client: Client,
    task: Task,
    settings: Settings,
) -> None:
    settings.ATTACHMENT_MAX_SIZE = 5

    response = _upload(client, task.pk, "fits.bin", b"12345")

    assert response.status_code == 201


@pytest.mark.django_db
def test_upload_without_a_file_is_rejected(client: Client, task: Task) -> None:
    response = client.post(f"/api/v1/tasks/{task.pk}/attachments", {})

    assert response.status_code == 422


@pytest.mark.django_db
def test_upload_to_another_users_task_is_not_found(
    client: Client,
    grace: User,
    media_root: Path,
) -> None:
    task = services.create_task(services.inbox(grace), "Private")

    response = _upload(client, task.pk, "x.txt")

    assert response.status_code == 404
    assert _stored_files(media_root) == []


@pytest.mark.django_db
def test_list_returns_the_tasks_attachments_oldest_first(client: Client, task: Task) -> None:
    _upload(client, task.pk, "first.txt")
    _upload(client, task.pk, "second.txt")

    response = client.get(f"/api/v1/tasks/{task.pk}/attachments")

    assert response.status_code == 200
    assert [item["name"] for item in response.json()] == ["first.txt", "second.txt"]


@pytest.mark.django_db
def test_list_of_another_users_task_is_not_found(client: Client, grace: User) -> None:
    task = services.create_task(services.inbox(grace), "Private")

    response = client.get(f"/api/v1/tasks/{task.pk}/attachments")

    assert response.status_code == 404


@pytest.mark.django_db
def test_download_returns_the_file_as_an_attachment(client: Client, task: Task) -> None:
    attachment_id = _upload(client, task.pk, "page.html", b"<script>").json()["id"]

    response, content = _download(client, attachment_id)

    assert response.status_code == 200
    assert content == b"<script>"
    assert response["Content-Type"] == "text/html"
    assert response["Content-Disposition"] == 'attachment; filename="page.html"'
    assert response["X-Content-Type-Options"] == "nosniff"
    assert response["Content-Security-Policy"] == "sandbox"


@pytest.mark.django_db
@pytest.mark.parametrize("name", ["photo.png", "photo.jpg", "anim.gif", "pic.webp", "scan.pdf"])
def test_download_shows_safe_images_and_pdfs_inline(client: Client, task: Task, name: str) -> None:
    attachment_id = _upload(client, task.pk, name).json()["id"]

    response, _content = _download(client, attachment_id)

    assert response["Content-Disposition"] == f'inline; filename="{name}"'


@pytest.mark.django_db
def test_download_never_shows_svg_inline(client: Client, task: Task) -> None:
    attachment_id = _upload(client, task.pk, "logo.svg").json()["id"]

    response, _content = _download(client, attachment_id)

    assert response["Content-Disposition"].startswith("attachment;")


@pytest.mark.django_db
def test_download_of_another_users_attachment_is_not_found(
    client: Client,
    grace: User,
) -> None:
    task = services.create_task(services.inbox(grace), "Private")
    grace_client = Client()
    grace_client.force_login(grace)
    attachment_id = _upload(grace_client, task.pk, "secret.txt").json()["id"]

    response, _content = _download(client, attachment_id)

    assert response.status_code == 404


@pytest.mark.django_db
def test_delete_removes_the_attachment_and_its_file_after_commit(
    client: Client,
    task: Task,
    media_root: Path,
    django_capture_on_commit_callbacks: DjangoCaptureOnCommitCallbacks,
) -> None:
    attachment_id = _upload(client, task.pk, "old.txt").json()["id"]

    with django_capture_on_commit_callbacks(execute=True) as callbacks:
        response = client.delete(f"/api/v1/attachments/{attachment_id}")
        assert len(_stored_files(media_root)) == 1

    assert response.status_code == 204
    assert len(callbacks) == 1
    assert _stored_files(media_root) == []
    assert client.get(f"/api/v1/tasks/{task.pk}/attachments").json() == []


@pytest.mark.django_db
def test_delete_of_another_users_attachment_is_not_found(
    client: Client,
    grace: User,
    media_root: Path,
) -> None:
    task = services.create_task(services.inbox(grace), "Private")
    grace_client = Client()
    grace_client.force_login(grace)
    attachment_id = _upload(grace_client, task.pk, "secret.txt").json()["id"]

    response = client.delete(f"/api/v1/attachments/{attachment_id}")

    assert response.status_code == 404
    assert len(_stored_files(media_root)) == 1


@pytest.mark.django_db
def test_adding_and_removing_is_recorded_in_activity(client: Client, task: Task) -> None:
    attachment_id = _upload(client, task.pk, "receipt.pdf").json()["id"]
    client.delete(f"/api/v1/attachments/{attachment_id}")

    items = client.get(f"/api/v1/tasks/{task.pk}/activity").json()["items"]

    assert [(item["kind"], item["data"]) for item in items[:2]] == [
        ("attachment_removed", {"name": "receipt.pdf"}),
        ("attachment_added", {"name": "receipt.pdf"}),
    ]


@pytest.mark.django_db
def test_task_rows_count_their_attachments(client: Client, ada: User, task: Task) -> None:
    _upload(client, task.pk, "a.txt")
    _upload(client, task.pk, "b.txt")

    rows = client.get(f"/api/v1/tasks?project={services.inbox(ada).pk}").json()["items"]
    detail = client.get(f"/api/v1/tasks/{task.pk}").json()

    assert rows[0]["attachment_count"] == 2
    assert detail["attachment_count"] == 2
