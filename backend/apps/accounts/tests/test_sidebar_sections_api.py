"""Tests for the sidebar section collapse endpoint."""

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


def set_sidebar_sections(client: Client, changes: dict[str, bool]) -> Response:
    return client.patch(
        "/api/v1/auth/sidebar-sections",
        changes,
        content_type="application/json",
        headers={"X-CSRFToken": client.cookies["csrftoken"].value},
    )


def session_user(client: Client) -> dict[str, object]:
    user: dict[str, object] = client.get("/api/v1/auth/session").json()["user"]
    return user


@pytest.mark.django_db
def test_every_section_is_collapsed_for_a_new_user(browser: Client, ada: User) -> None:
    browser.force_login(ada)

    user = session_user(browser)

    assert user["projects_collapsed"] is True
    assert user["tags_collapsed"] is True
    assert user["people_collapsed"] is True


@pytest.mark.django_db
def test_expanding_one_section_leaves_the_others(browser: Client, ada: User) -> None:
    browser.force_login(ada)
    browser.get("/api/v1/auth/session")

    response = set_sidebar_sections(browser, {"tags_collapsed": False})

    assert response.status_code == 200
    body = response.json()
    assert body["projects_collapsed"] is True
    assert body["tags_collapsed"] is False
    assert body["people_collapsed"] is True
    assert session_user(browser)["tags_collapsed"] is False


@pytest.mark.django_db
def test_several_sections_change_at_once(browser: Client, ada: User) -> None:
    browser.force_login(ada)
    browser.get("/api/v1/auth/session")

    set_sidebar_sections(browser, {"projects_collapsed": False, "people_collapsed": False})

    user = session_user(browser)
    assert user["projects_collapsed"] is False
    assert user["tags_collapsed"] is True
    assert user["people_collapsed"] is False


@pytest.mark.django_db
def test_sidebar_sections_only_change_for_the_signed_in_user(browser: Client, ada: User) -> None:
    grace = User.objects.create_user("grace@example.com", PASSWORD)
    browser.force_login(ada)
    browser.get("/api/v1/auth/session")

    set_sidebar_sections(browser, {"projects_collapsed": False})

    grace.refresh_from_db()
    assert grace.projects_collapsed is True


@pytest.mark.django_db
def test_sidebar_sections_require_a_session(browser: Client) -> None:
    response = set_sidebar_sections(browser, {"projects_collapsed": False})

    assert response.status_code == 401
