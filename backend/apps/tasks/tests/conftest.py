"""Fixtures shared by the tasks tests."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from django.test import Client
from django.utils import timezone

from apps.accounts.models import User

if TYPE_CHECKING:
    from collections.abc import Callable
    from datetime import datetime


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
