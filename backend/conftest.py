"""Fixtures shared by every test in the backend."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

if TYPE_CHECKING:
    from pytest_django import Settings


@pytest.fixture(autouse=True)
def _plain_static_files_storage(settings: Settings) -> None:
    """Skip WhiteNoise's manifest lookup, which needs collectstatic to have run."""
    settings.STORAGES = {
        **settings.STORAGES,
        "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
    }
