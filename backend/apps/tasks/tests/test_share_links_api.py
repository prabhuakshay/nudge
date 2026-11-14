"""Tests for the owner's Share link endpoints: create, list and stop sharing a Project."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

import pytest
from django.test import Client

from apps.tasks import project_trash, projects, services, share_links

if TYPE_CHECKING:
    from collections.abc import Callable

    from django.test.client import _MonkeyPatchedWSGIResponse as Response
    from pytest_django import Settings

    from apps.accounts.models import User

_NOW = datetime(2026, 11, 2, 9, 30, tzinfo=UTC)
_LATER = datetime(2026, 11, 3, 18, 0, tzinfo=UTC)
_BAD_EXPIRY = "A Share link expires after 1 to 3650 days, or never."
_BAD_RANGE = "A Share link's range is 7, 14 or 30 days, or all."


def _share(
    client: Client, project_id: int, chosen: dict[str, int | None] | None = None
) -> Response:
    return client.post(
        f"/api/v1/projects/{project_id}/share-links", chosen or {}, content_type="application/json"
    )


def _change(client: Client, link_id: int, change: dict[str, int | None]) -> Response:
    return client.patch(f"/api/v1/share-links/{link_id}", change, content_type="application/json")


@pytest.fixture(autouse=True)
def public_url(settings: Settings) -> None:
    settings.PUBLIC_URL = "https://nudge.example.com"


@pytest.mark.django_db
def test_creating_a_share_link_without_a_body_uses_the_default_settings(
    client: Client, ada: User, freeze_time: Callable[[datetime], None]
) -> None:
    freeze_time(_NOW)
    work = projects.create_project(ada, "Work")

    response = client.generic("POST", f"/api/v1/projects/{work.pk}/share-links")

    assert response.status_code == 201
    link = response.json()
    assert link["url"].startswith("https://nudge.example.com/share/")
    assert link["project_id"] == work.pk
    assert link["created_at"] == "2026-11-02T09:30:00Z"
    assert link["expires_at"] == "2026-11-09T09:30:00Z"
    assert link["range_days"] == 14
    assert link["last_opened_at"] is None


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("chosen", "expected"),
    [
        ({"expires_in_days": 1, "range_days": 7}, ("2026-11-03T09:30:00Z", 7)),
        ({"expires_in_days": 30, "range_days": 30}, ("2026-12-02T09:30:00Z", 30)),
        ({"expires_in_days": 45}, ("2026-12-17T09:30:00Z", 14)),
        ({"expires_in_days": None, "range_days": None}, (None, None)),
    ],
)
def test_creating_a_share_link_with_chosen_settings(
    client: Client,
    ada: User,
    freeze_time: Callable[[datetime], None],
    chosen: dict[str, int | None],
    expected: tuple[str | None, int | None],
) -> None:
    freeze_time(_NOW)
    work = projects.create_project(ada, "Work")

    response = _share(client, work.pk, chosen)

    assert response.status_code == 201
    assert (response.json()["expires_at"], response.json()["range_days"]) == expected


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("chosen", "reason"),
    [
        ({"expires_in_days": 0}, _BAD_EXPIRY),
        ({"expires_in_days": -3}, _BAD_EXPIRY),
        ({"expires_in_days": 3651}, _BAD_EXPIRY),
        ({"range_days": 10}, _BAD_RANGE),
        ({"range_days": 0}, _BAD_RANGE),
    ],
)
def test_creating_a_share_link_refuses_other_settings(
    client: Client, ada: User, chosen: dict[str, int | None], reason: str
) -> None:
    work = projects.create_project(ada, "Work")

    response = _share(client, work.pk, chosen)

    assert response.status_code == 422
    assert response.json() == {"detail": reason}
    assert not work.share_links.exists()


@pytest.mark.django_db
def test_a_project_can_have_several_share_links_each_with_its_own_address(
    client: Client, ada: User
) -> None:
    work = projects.create_project(ada, "Work")
    first = _share(client, work.pk).json()
    second = _share(client, work.pk).json()

    response = client.get(f"/api/v1/projects/{work.pk}/share-links")

    assert response.status_code == 200
    assert [link["id"] for link in response.json()] == [first["id"], second["id"]]
    assert first["url"] != second["url"]


@pytest.mark.django_db
def test_stopping_a_share_link_takes_it_off_the_list(client: Client, ada: User) -> None:
    work = projects.create_project(ada, "Work")
    stopped = _share(client, work.pk).json()
    kept = _share(client, work.pk).json()

    response = client.post(f"/api/v1/share-links/{stopped['id']}/stop")

    assert response.status_code == 204
    listed = client.get(f"/api/v1/projects/{work.pk}/share-links").json()
    assert [link["id"] for link in listed] == [kept["id"]]


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("change", "expected"),
    [
        ({"expires_in_days": 30}, ("2026-12-03T18:00:00Z", 14)),
        ({"expires_in_days": None}, (None, 14)),
        ({"range_days": 30}, ("2026-11-09T09:30:00Z", 30)),
        ({"range_days": None}, ("2026-11-09T09:30:00Z", None)),
        ({"expires_in_days": 1, "range_days": 7}, ("2026-11-04T18:00:00Z", 7)),
        ({}, ("2026-11-09T09:30:00Z", 14)),
    ],
)
def test_changing_a_share_links_expiry_or_range(
    client: Client,
    ada: User,
    freeze_time: Callable[[datetime], None],
    change: dict[str, int | None],
    expected: tuple[str | None, int | None],
) -> None:
    freeze_time(_NOW)
    link = share_links.create_share_link(ada, projects.create_project(ada, "Work").pk)
    freeze_time(_LATER)

    response = _change(client, link.pk, change)

    assert response.status_code == 200
    assert (response.json()["expires_at"], response.json()["range_days"]) == expected
    assert response.json()["url"] == link.url


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("change", "reason"),
    [
        ({"expires_in_days": 0}, _BAD_EXPIRY),
        ({"range_days": 60}, _BAD_RANGE),
        ({"expires_in_days": 30, "range_days": 60}, _BAD_RANGE),
    ],
)
def test_changing_a_share_link_refuses_other_settings(
    client: Client,
    ada: User,
    freeze_time: Callable[[datetime], None],
    change: dict[str, int | None],
    reason: str,
) -> None:
    freeze_time(_NOW)
    link = share_links.create_share_link(ada, projects.create_project(ada, "Work").pk)

    response = _change(client, link.pk, change)

    assert response.status_code == 422
    assert response.json() == {"detail": reason}
    listed = client.get(f"/api/v1/projects/{link.project_id}/share-links").json()
    assert listed[0]["expires_at"] == "2026-11-09T09:30:00Z"
    assert listed[0]["range_days"] == 14


@pytest.mark.django_db
def test_extending_an_expired_share_link_makes_it_work_again(
    client: Client, ada: User, freeze_time: Callable[[datetime], None]
) -> None:
    freeze_time(_NOW)
    link = share_links.create_share_link(ada, projects.create_project(ada, "Work").pk)
    freeze_time(_NOW + timedelta(days=8))
    assert Client().get(f"/api/v1/share/{link.key}").status_code == 410

    _change(client, link.pk, {"expires_in_days": 7})

    assert Client().get(f"/api/v1/share/{link.key}").status_code == 200


@pytest.mark.django_db
def test_the_inbox_cant_be_shared(client: Client, ada: User) -> None:
    response = _share(client, services.inbox(ada).pk)

    assert response.status_code == 422
    assert response.json() == {"detail": "The Inbox can't be shared."}


@pytest.mark.django_db
def test_a_project_in_trash_cant_be_shared(client: Client, ada: User) -> None:
    work = projects.create_project(ada, "Work")
    project_trash.trash_project(ada, work.pk)

    response = _share(client, work.pk)

    assert response.status_code == 422
    assert response.json() == {"detail": "A Project in Trash can't be shared. Restore it first."}


@pytest.mark.django_db
def test_an_archived_project_can_be_shared(client: Client, ada: User) -> None:
    work = projects.create_project(ada, "Work")
    projects.archive_project(ada, work.pk)

    response = _share(client, work.pk)

    assert response.status_code == 201


@pytest.mark.django_db
@pytest.mark.parametrize("method", ["get", "post"])
def test_another_users_project_is_not_found(client: Client, grace: User, method: str) -> None:
    theirs = projects.create_project(grace, "Theirs")

    response = getattr(client, method)(
        f"/api/v1/projects/{theirs.pk}/share-links", content_type="application/json"
    )

    assert response.status_code == 404
    assert not theirs.share_links.exists()


@pytest.mark.django_db
def test_another_users_share_link_cant_be_stopped(client: Client, grace: User) -> None:
    theirs = share_links.create_share_link(grace, projects.create_project(grace, "Theirs").pk)

    response = client.post(f"/api/v1/share-links/{theirs.pk}/stop")

    assert response.status_code == 404
    theirs.refresh_from_db()
    assert theirs.is_active


@pytest.mark.django_db
def test_another_users_share_link_cant_be_changed(client: Client, grace: User) -> None:
    theirs = share_links.create_share_link(grace, projects.create_project(grace, "Theirs").pk)

    response = _change(client, theirs.pk, {"expires_in_days": None})

    assert response.status_code == 404
    theirs.refresh_from_db()
    assert theirs.expires_at is not None


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("get", "/api/v1/projects/{project}/share-links"),
        ("post", "/api/v1/projects/{project}/share-links"),
        ("post", "/api/v1/share-links/{link}/stop"),
        ("patch", "/api/v1/share-links/{link}"),
    ],
)
def test_managing_share_links_requires_a_session(ada: User, method: str, path: str) -> None:
    work = projects.create_project(ada, "Work")
    link = share_links.create_share_link(ada, work.pk)

    response = getattr(Client(), method)(
        path.format(project=work.pk, link=link.pk), content_type="application/json"
    )

    assert response.status_code == 401
    link.refresh_from_db()
    assert link.is_active
