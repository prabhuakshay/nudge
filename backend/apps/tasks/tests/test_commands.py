"""Tests for the storage management commands: check_storage and copy_media_to_storage."""

from __future__ import annotations

from io import StringIO
from typing import TYPE_CHECKING

import pytest
from django.core.management import CommandError, call_command

if TYPE_CHECKING:
    from collections.abc import Callable
    from pathlib import Path

    from pytest_django import Settings


@pytest.fixture(autouse=True)
def media_root(settings: Settings, tmp_path: Path) -> Path:
    settings.MEDIA_ROOT = tmp_path
    return tmp_path


def _run(command: str) -> str:
    output = StringIO()
    call_command(command, stdout=output)
    return output.getvalue()


def _local_attachment(media_root: Path, key: str, content: bytes) -> None:
    path = media_root / key
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)


def test_check_storage_passes_and_removes_its_dummy_file(bucket: Callable[[], list[str]]) -> None:
    output = _run("check_storage")

    assert output == "Storage OK: wrote, read back and deleted a test file.\n"
    assert bucket() == []


def test_check_storage_also_checks_the_file_system(media_root: Path) -> None:
    output = _run("check_storage")

    assert output.startswith("Storage OK")
    assert [path for path in media_root.rglob("*") if path.is_file()] == []


def test_check_storage_reports_the_storage_error(
    bucket: Callable[[], list[str]],
    settings: Settings,
) -> None:
    default = settings.STORAGES["default"]
    settings.STORAGES = {
        **settings.STORAGES,
        "default": {**default, "OPTIONS": {**default["OPTIONS"], "bucket_name": "missing"}},
    }

    with pytest.raises(CommandError, match=r"^Storage check failed: .*NoSuchBucket"):
        _run("check_storage")

    assert bucket() == []


def test_copy_media_to_storage_copies_local_attachments_and_keeps_them(
    bucket: Callable[[], list[str]],
    media_root: Path,
) -> None:
    _local_attachment(media_root, "attachments/1/aaa", b"first")
    _local_attachment(media_root, "attachments/2/bbb", b"second")

    output = _run("copy_media_to_storage")

    assert output == "Copied 2, skipped 0 already in storage.\n"
    assert bucket() == ["attachments/1/aaa", "attachments/2/bbb"]
    assert (media_root / "attachments/1/aaa").read_bytes() == b"first"


def test_copy_media_to_storage_skips_files_already_copied(
    bucket: Callable[[], list[str]],
    media_root: Path,
) -> None:
    _local_attachment(media_root, "attachments/1/aaa", b"first")
    _run("copy_media_to_storage")
    _local_attachment(media_root, "attachments/1/bbb", b"second")

    output = _run("copy_media_to_storage")

    assert output == "Copied 1, skipped 1 already in storage.\n"
    assert bucket() == ["attachments/1/aaa", "attachments/1/bbb"]


@pytest.mark.usefixtures("bucket")
def test_copy_media_to_storage_with_no_local_attachments_copies_nothing() -> None:
    output = _run("copy_media_to_storage")

    assert output == "Copied 0, skipped 0 already in storage.\n"


def test_copy_media_to_storage_refuses_when_storage_is_the_file_system(media_root: Path) -> None:
    _local_attachment(media_root, "attachments/1/aaa", b"first")

    with pytest.raises(CommandError, match="no bucket is configured"):
        _run("copy_media_to_storage")
