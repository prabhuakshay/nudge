"""Tests for core business logic."""

from __future__ import annotations

import pytest
from django.db import OperationalError, connection

from apps.core import services


@pytest.mark.django_db
def test_database_is_available_when_connection_succeeds() -> None:
    assert services.database_is_available() is True


def test_database_is_unavailable_when_connection_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    def refuse() -> None:
        raise OperationalError

    monkeypatch.setattr(connection, "ensure_connection", refuse)

    assert services.database_is_available() is False
