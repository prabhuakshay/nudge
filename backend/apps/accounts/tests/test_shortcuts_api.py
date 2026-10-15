"""Tests for the single-key shortcuts setting endpoint."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from django.test import Client

from apps.accounts.models import User

if TYPE_CHECKING:
    from django.test.client import _MonkeyPatchedWSGIResponse as Response

PASSWORD = "an-unusual-passphrase"


@pytest.fixture
def ada() -> User:
    return User.objects.create_user("ada@example.com", PASSWORD)


@pytest.fixture
def browser() -> Client:
    """A client that enforces CSRF checks, like a real browser session."""
    client = Client(enforce_csrf_checks=True)
    client.get("/api/v1/auth/session")
    return client


def set_single_key_shortcuts(client: Client, *, enabled: bool) -> Response:
    return client.put(
        "/api/v1/auth/shortcuts",
        {"single_key": enabled},
        content_type="application/json",
        headers={"X-CSRFToken": client.cookies["csrftoken"].value},
    )


@pytest.mark.django_db
def test_single_key_shortcuts_are_on_for_a_new_user(browser: Client, ada: User) -> None:
    browser.force_login(ada)

    response = browser.get("/api/v1/auth/session")

    assert response.json()["user"]["single_key_shortcuts"] is True


@pytest.mark.django_db
def test_turning_single_key_shortcuts_off_saves_it(browser: Client, ada: User) -> None:
    browser.force_login(ada)
    browser.get("/api/v1/auth/session")

    response = set_single_key_shortcuts(browser, enabled=False)

    assert response.status_code == 200
    assert response.json()["single_key_shortcuts"] is False
    ada.refresh_from_db()
    assert ada.single_key_shortcuts is False


@pytest.mark.django_db
def test_single_key_shortcuts_only_change_for_the_signed_in_user(
    browser: Client, ada: User
) -> None:
    grace = User.objects.create_user("grace@example.com", PASSWORD)
    browser.force_login(ada)
    browser.get("/api/v1/auth/session")

    set_single_key_shortcuts(browser, enabled=False)

    grace.refresh_from_db()
    assert grace.single_key_shortcuts is True


@pytest.mark.django_db
def test_single_key_shortcuts_require_a_session(browser: Client) -> None:
    response = set_single_key_shortcuts(browser, enabled=False)

    assert response.status_code == 401
