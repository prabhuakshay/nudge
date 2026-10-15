"""Tests for the sign-in, sign-out and session endpoints."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from django.core.cache import cache
from django.test import Client

from apps.accounts.models import User

if TYPE_CHECKING:
    from collections.abc import Iterator

PASSWORD = "an-unusual-passphrase"


@pytest.fixture(autouse=True)
def _reset_rate_limits() -> Iterator[None]:
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def ada() -> User:
    return User.objects.create_user("ada@example.com", PASSWORD, full_name="Ada Lovelace")


@pytest.fixture
def browser() -> Client:
    """A client that enforces CSRF checks, like a real browser session."""
    client = Client(enforce_csrf_checks=True)
    client.get("/api/v1/auth/session")
    return client


def csrf_headers(client: Client) -> dict[str, str]:
    return {"X-CSRFToken": client.cookies["csrftoken"].value}


@pytest.mark.django_db
def test_session_is_empty_and_sets_csrf_cookie_for_anonymous_visitor() -> None:
    client = Client()

    response = client.get("/api/v1/auth/session")

    assert response.status_code == 200
    assert response.json() == {"user": None}
    assert "csrftoken" in response.cookies


@pytest.mark.django_db
def test_login_starts_a_session(browser: Client, ada: User) -> None:
    response = browser.post(
        "/api/v1/auth/login",
        {"email": " ADA@example.com ", "password": PASSWORD},
        content_type="application/json",
        headers=csrf_headers(browser),
    )

    assert response.status_code == 200
    assert response.json() == {
        "id": ada.pk,
        "email": "ada@example.com",
        "full_name": "Ada Lovelace",
    }
    session = browser.get("/api/v1/auth/session").json()
    assert session["user"]["email"] == "ada@example.com"


@pytest.mark.django_db
@pytest.mark.usefixtures("ada")
def test_login_rejects_wrong_password(browser: Client) -> None:
    response = browser.post(
        "/api/v1/auth/login",
        {"email": "ada@example.com", "password": "wrong"},
        content_type="application/json",
        headers=csrf_headers(browser),
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "That email and password don't match an account."}


@pytest.mark.django_db
@pytest.mark.usefixtures("ada")
def test_login_requires_csrf_token(browser: Client) -> None:
    response = browser.post(
        "/api/v1/auth/login",
        {"email": "ada@example.com", "password": PASSWORD},
        content_type="application/json",
    )

    assert response.status_code == 403


@pytest.mark.django_db
def test_login_is_rate_limited(browser: Client) -> None:
    attempts = [
        browser.post(
            "/api/v1/auth/login",
            {"email": "nobody@example.com", "password": "wrong"},
            content_type="application/json",
            headers=csrf_headers(browser),
        ).status_code
        for _ in range(11)
    ]

    assert attempts[:10] == [401] * 10
    assert attempts[10] == 429


@pytest.mark.django_db
def test_logout_ends_the_session(browser: Client, ada: User) -> None:
    browser.force_login(ada)
    browser.get("/api/v1/auth/session")

    response = browser.post("/api/v1/auth/logout", headers=csrf_headers(browser))

    assert response.status_code == 204
    assert browser.get("/api/v1/auth/session").json() == {"user": None}


@pytest.mark.django_db
def test_logout_requires_a_session() -> None:
    response = Client().post("/api/v1/auth/logout")

    assert response.status_code == 401


def test_there_is_no_signup_endpoint() -> None:
    response = Client().post("/api/v1/auth/signup")

    assert response.status_code == 404
