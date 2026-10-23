"""Tests for the core HTTP API."""

from __future__ import annotations

import tomllib
from typing import TYPE_CHECKING

import pytest
from django.conf import settings

if TYPE_CHECKING:
    from django.test import Client


@pytest.mark.django_db
def test_health_reports_ok_when_database_is_up(client: Client) -> None:
    response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok"}


def test_health_reports_degraded_when_database_is_down(
    client: Client, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr("apps.core.services.database_is_available", lambda: False)

    response = client.get("/api/v1/health")

    assert response.status_code == 503
    assert response.json() == {"status": "degraded", "database": "unavailable"}


def test_unknown_api_path_returns_404_instead_of_the_app(client: Client) -> None:
    response = client.get("/api/v1/does-not-exist")

    assert response.status_code == 404
    assert response.json() == {"detail": "Not Found"}


def test_openapi_schema_reports_the_project_version(client: Client) -> None:
    with (settings.BASE_DIR / "pyproject.toml").open("rb") as file:
        version = tomllib.load(file)["project"]["version"]

    response = client.get("/api/v1/openapi.json")

    assert response.json()["info"]["version"] == version
