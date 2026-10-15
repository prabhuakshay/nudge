"""Tests for serving the React app."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from config.settings import immutable_file_test

if TYPE_CHECKING:
    from pathlib import Path

    from django.test import Client
    from pytest_django import Settings


@pytest.fixture
def built_frontend(tmp_path: Path, settings: Settings) -> Path:
    (tmp_path / "index.html").write_text("<!doctype html><title>Nudge</title>")
    settings.FRONTEND_DIST_DIR = tmp_path
    return tmp_path


@pytest.mark.usefixtures("built_frontend")
@pytest.mark.parametrize("path", ["/", "/inbox", "/lists/42?sort=due"])
def test_app_routes_return_index_html(client: Client, path: str) -> None:
    response = client.get(path)

    assert response.status_code == 200
    assert b"<title>Nudge</title>" in response.content
    assert response["Cache-Control"] == "no-cache"


def test_missing_build_returns_helpful_404(
    client: Client, tmp_path: Path, settings: Settings
) -> None:
    settings.FRONTEND_DIST_DIR = tmp_path

    response = client.get("/inbox")

    assert response.status_code == 404
    assert b"npm run build" in response.content


@pytest.mark.parametrize(
    ("url", "expected"),
    [
        ("/assets/index-BxT3a9Qe.js", True),
        ("/assets/index-a1b2c3d4_e5.css", True),
        ("/index.html", False),
        ("/favicon.ico", False),
        ("/assets/logo.svg", False),
    ],
)
def test_only_hashed_vite_assets_are_immutable(url: str, *, expected: bool) -> None:
    assert immutable_file_test("", url) is expected
