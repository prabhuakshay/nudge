"""Fixtures shared by the tasks tests."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from django.test import Client
from django.utils import timezone

from apps.accounts.models import User
from apps.tasks.models.attachments import ATTACHMENTS_FOLDER

if TYPE_CHECKING:
    from collections.abc import Callable
    from datetime import datetime
    from pathlib import Path

    from pytest_django import Settings


@pytest.fixture
def ada() -> User:
    return User.objects.create_user("ada@example.com", "an-unusual-passphrase")


@pytest.fixture
def grace() -> User:
    return User.objects.create_user("grace@example.com", "an-unusual-passphrase")


@pytest.fixture
def client(ada: User) -> Client:
    client = Client()
    client.force_login(ada)
    return client


@pytest.fixture
def freeze_time(monkeypatch: pytest.MonkeyPatch) -> Callable[[datetime], None]:
    """Return a function that stops Django's clock at the instant it's given."""

    def freeze(instant: datetime) -> None:
        monkeypatch.setattr(timezone, "now", lambda: instant)

    return freeze


@pytest.fixture(params=["file_system", "bucket"])
def stored_files(
    request: pytest.FixtureRequest,
    settings: Settings,
    tmp_path: Path,
) -> Callable[[], list[str]]:
    """Run the test once with files on disk and once in a bucket; return a key lister.

    Both runs must behave the same, so the lister returns storage keys either way.
    """
    settings.MEDIA_ROOT = tmp_path
    settings.FILE_UPLOAD_TEMP_DIR = tmp_path / "uploads"
    settings.FILE_UPLOAD_TEMP_DIR.mkdir()
    if request.param == "bucket":
        bucket_keys: Callable[[], list[str]] = request.getfixturevalue("bucket")
        return bucket_keys

    def file_system_keys() -> list[str]:
        files = (path for path in (tmp_path / ATTACHMENTS_FOLDER).rglob("*") if path.is_file())
        return sorted(str(path.relative_to(tmp_path)) for path in files)

    return file_system_keys
