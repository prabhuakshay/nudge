"""Tests for the sign-in, sign-out and session endpoints."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from django.core.cache import cache
from django.test import Client

from apps.accounts.models import User

if TYPE_CHECKING:
    from collections.abc import Iterator

    from django.test.client import _MonkeyPatchedWSGIResponse as Response

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
        "time_zone": "",
        "single_key_shortcuts": True,
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


NEW_PASSWORD = "a-fresh-passphrase"


def change_password(client: Client, current: str, new: str) -> Response:
    return client.post(
        "/api/v1/auth/password",
        {"current_password": current, "new_password": new},
        content_type="application/json",
        headers=csrf_headers(client),
    )


@pytest.mark.django_db
def test_change_password_keeps_this_session_and_ends_others(browser: Client, ada: User) -> None:
    other_device = Client()
    other_device.force_login(ada)
    browser.force_login(ada)
    browser.get("/api/v1/auth/session")

    response = change_password(browser, PASSWORD, NEW_PASSWORD)

    assert response.status_code == 204
    ada.refresh_from_db()
    assert ada.check_password(NEW_PASSWORD)
    assert browser.get("/api/v1/auth/session").json()["user"]["email"] == "ada@example.com"
    assert other_device.get("/api/v1/auth/session").json() == {"user": None}


@pytest.mark.django_db
def test_change_password_rejects_wrong_current_password(browser: Client, ada: User) -> None:
    browser.force_login(ada)
    browser.get("/api/v1/auth/session")

    response = change_password(browser, "wrong", NEW_PASSWORD)

    assert response.status_code == 400
    assert response.json() == {"detail": "Your current password is incorrect."}
    ada.refresh_from_db()
    assert ada.check_password(PASSWORD)


@pytest.mark.django_db
def test_change_password_enforces_password_rules(browser: Client, ada: User) -> None:
    browser.force_login(ada)
    browser.get("/api/v1/auth/session")

    response = change_password(browser, PASSWORD, "short")

    assert response.status_code == 400
    assert "too short" in response.json()["detail"]


@pytest.mark.django_db
def test_change_password_requires_csrf_token(ada: User) -> None:
    client = Client(enforce_csrf_checks=True)
    client.force_login(ada)

    response = client.post(
        "/api/v1/auth/password",
        {"current_password": PASSWORD, "new_password": NEW_PASSWORD},
        content_type="application/json",
    )

    assert response.status_code == 403


@pytest.mark.django_db
def test_change_password_requires_a_session(browser: Client) -> None:
    response = change_password(browser, PASSWORD, NEW_PASSWORD)

    assert response.status_code == 401


@pytest.mark.django_db
def test_change_password_is_rate_limited(browser: Client, ada: User) -> None:
    browser.force_login(ada)
    browser.get("/api/v1/auth/session")

    attempts = [change_password(browser, "wrong", NEW_PASSWORD).status_code for _ in range(11)]

    assert attempts[:10] == [400] * 10
    assert attempts[10] == 429


def update_profile(client: Client, full_name: str) -> Response:
    return client.patch(
        "/api/v1/auth/profile",
        {"full_name": full_name},
        content_type="application/json",
        headers=csrf_headers(client),
    )


@pytest.mark.django_db
def test_update_profile_changes_the_name(browser: Client, ada: User) -> None:
    browser.force_login(ada)
    browser.get("/api/v1/auth/session")

    response = update_profile(browser, "Augusta Ada King")

    assert response.status_code == 200
    assert response.json() == {
        "id": ada.pk,
        "email": "ada@example.com",
        "full_name": "Augusta Ada King",
        "time_zone": "",
        "single_key_shortcuts": True,
    }


@pytest.mark.django_db
def test_update_profile_only_changes_the_signed_in_user(browser: Client, ada: User) -> None:
    grace = User.objects.create_user("grace@example.com", PASSWORD, full_name="Grace Hopper")
    browser.force_login(ada)
    browser.get("/api/v1/auth/session")

    update_profile(browser, "Augusta Ada King")

    grace.refresh_from_db()
    assert grace.full_name == "Grace Hopper"


@pytest.mark.django_db
def test_update_profile_rejects_overlong_names(browser: Client, ada: User) -> None:
    browser.force_login(ada)
    browser.get("/api/v1/auth/session")

    response = update_profile(browser, "x" * 151)

    assert response.status_code == 422


@pytest.mark.django_db
def test_update_profile_requires_a_session(browser: Client) -> None:
    response = update_profile(browser, "Nobody")

    assert response.status_code == 401


def set_time_zone(client: Client, time_zone: str) -> Response:
    return client.put(
        "/api/v1/auth/time-zone",
        {"time_zone": time_zone},
        content_type="application/json",
        headers=csrf_headers(client),
    )


@pytest.mark.django_db
def test_set_time_zone_saves_it_and_returns_the_user(browser: Client, ada: User) -> None:
    browser.force_login(ada)
    browser.get("/api/v1/auth/session")

    response = set_time_zone(browser, "Europe/London")

    assert response.status_code == 200
    assert response.json()["time_zone"] == "Europe/London"
    ada.refresh_from_db()
    assert ada.time_zone == "Europe/London"


@pytest.mark.django_db
def test_session_includes_the_time_zone(browser: Client, ada: User) -> None:
    ada.time_zone = "Asia/Kolkata"
    ada.save()
    browser.force_login(ada)

    response = browser.get("/api/v1/auth/session")

    assert response.json()["user"]["time_zone"] == "Asia/Kolkata"


@pytest.mark.django_db
@pytest.mark.parametrize("time_zone", ["", "Mars/Olympus_Mons", "europe/london"])
def test_set_time_zone_rejects_names_that_are_not_iana_zones(
    browser: Client, ada: User, time_zone: str
) -> None:
    browser.force_login(ada)
    browser.get("/api/v1/auth/session")

    response = set_time_zone(browser, time_zone)

    assert response.status_code == 422
    ada.refresh_from_db()
    assert ada.time_zone == ""


@pytest.mark.django_db
def test_set_time_zone_only_changes_the_signed_in_user(browser: Client, ada: User) -> None:
    grace = User.objects.create_user("grace@example.com", PASSWORD, time_zone="America/New_York")
    browser.force_login(ada)
    browser.get("/api/v1/auth/session")

    set_time_zone(browser, "Europe/London")

    grace.refresh_from_db()
    assert grace.time_zone == "America/New_York"


@pytest.mark.django_db
def test_set_time_zone_requires_a_session(browser: Client) -> None:
    response = set_time_zone(browser, "Europe/London")

    assert response.status_code == 401
