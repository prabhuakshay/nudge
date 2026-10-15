"""Fixtures shared by the tasks tests."""

from __future__ import annotations

import pytest
from django.test import Client

from apps.accounts.models import User


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
