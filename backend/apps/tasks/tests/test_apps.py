"""Tests for the tasks app's start-up work."""

from __future__ import annotations

from typing import TYPE_CHECKING

from django.apps import apps

if TYPE_CHECKING:
    from pathlib import Path

    from pytest_django import Settings


def test_ready_creates_the_upload_spool(settings: Settings, tmp_path: Path) -> None:
    spool = tmp_path / "media" / "uploads"
    settings.FILE_UPLOAD_TEMP_DIR = spool

    apps.get_app_config("tasks").ready()

    assert spool.is_dir()
