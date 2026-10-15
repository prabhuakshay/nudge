"""Fixtures shared by the notifications tests."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from procrastinate import testing
from procrastinate.contrib.django import app

from apps.accounts.models import User

if TYPE_CHECKING:
    from collections.abc import Iterator

    from pytest_django import Settings

PUBLIC_KEY = "BPublicKeyForTests"
PRIVATE_KEY = "private-key-for-tests"


@pytest.fixture(autouse=True)
def jobs() -> Iterator[testing.InMemoryConnector]:
    """Queue background jobs in memory, so tests can see them without a worker."""
    connector = testing.InMemoryConnector()
    with app.replace_connector(connector):
        yield connector


@pytest.fixture
def push_configured(settings: Settings) -> None:
    settings.VAPID_PUBLIC_KEY = PUBLIC_KEY
    settings.VAPID_PRIVATE_KEY = PRIVATE_KEY
    settings.VAPID_SUBJECT = "mailto:admin@example.com"


@pytest.fixture
def ada() -> User:
    return User.objects.create_user("ada@example.com", "an-unusual-passphrase")


@pytest.fixture
def grace() -> User:
    return User.objects.create_user("grace@example.com", "an-unusual-passphrase")
