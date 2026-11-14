"""Tests for the owner's Share link endpoints: create, list and stop sharing a Project."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING

import pytest
from django.test import Client

from apps.tasks import project_trash, projects, services, share_links

if TYPE_CHECKING:
    from collections.abc import Callable

    from pytest_django import Settings

    from apps.accounts.models import User

_NOW = datetime(2026, 11, 2, 9, 30, tzinfo=UTC)


@pytest.fixture(autouse=True)
def public_url(settings: Settings) -> None:
    settings.PUBLIC_URL = "https://nudge.example.com"


@pytest.mark.django_db
def test_creating_a_share_link_uses_the_default_settings(
    client: Client, ada: User, freeze_time: Callable[[datetime], None]
) -> None:
    freeze_time(_NOW)
    work = projects.create_project(ada, "Work")

    response = client.post(f"/api/v1/projects/{work.pk}/share-links")

    assert response.status_code == 201
    link = response.json()
    assert link["url"].startswith("https://nudge.example.com/share/")
    assert link["project_id"] == work.pk
    assert link["created_at"] == "2026-11-02T09:30:00Z"
    assert link["expires_at"] == "2026-11-09T09:30:00Z"
    assert link["range_days"] == 14
    assert link["last_opened_at"] is None


@pytest.mark.django_db
def test_a_project_can_have_several_share_links_each_with_its_own_address(
    client: Client, ada: User
) -> None:
    work = projects.create_project(ada, "Work")
    first = client.post(f"/api/v1/projects/{work.pk}/share-links").json()
    second = client.post(f"/api/v1/projects/{work.pk}/share-links").json()

    response = client.get(f"/api/v1/projects/{work.pk}/share-links")

    assert response.status_code == 200
    assert [link["id"] for link in response.json()] == [first["id"], second["id"]]
    assert first["url"] != second["url"]


@pytest.mark.django_db
def test_stopping_a_share_link_takes_it_off_the_list(client: Client, ada: User) -> None:
    work = projects.create_project(ada, "Work")
    stopped = client.post(f"/api/v1/projects/{work.pk}/share-links").json()
    kept = client.post(f"/api/v1/projects/{work.pk}/share-links").json()

    response = client.post(f"/api/v1/share-links/{stopped['id']}/stop")

    assert response.status_code == 204
    listed = client.get(f"/api/v1/projects/{work.pk}/share-links").json()
    assert [link["id"] for link in listed] == [kept["id"]]


@pytest.mark.django_db
def test_the_inbox_cant_be_shared(client: Client, ada: User) -> None:
    response = client.post(f"/api/v1/projects/{services.inbox(ada).pk}/share-links")

    assert response.status_code == 422
    assert response.json() == {"detail": "The Inbox can't be shared."}


@pytest.mark.django_db
def test_a_project_in_trash_cant_be_shared(client: Client, ada: User) -> None:
    work = projects.create_project(ada, "Work")
    project_trash.trash_project(ada, work.pk)

    response = client.post(f"/api/v1/projects/{work.pk}/share-links")

    assert response.status_code == 422
    assert response.json() == {"detail": "A Project in Trash can't be shared. Restore it first."}


@pytest.mark.django_db
def test_an_archived_project_can_be_shared(client: Client, ada: User) -> None:
    work = projects.create_project(ada, "Work")
    projects.archive_project(ada, work.pk)

    response = client.post(f"/api/v1/projects/{work.pk}/share-links")

    assert response.status_code == 201


@pytest.mark.django_db
@pytest.mark.parametrize("method", ["get", "post"])
def test_another_users_project_is_not_found(client: Client, grace: User, method: str) -> None:
    theirs = projects.create_project(grace, "Theirs")

    response = getattr(client, method)(f"/api/v1/projects/{theirs.pk}/share-links")

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
@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("get", "/api/v1/projects/{project}/share-links"),
        ("post", "/api/v1/projects/{project}/share-links"),
        ("post", "/api/v1/share-links/{link}/stop"),
    ],
)
def test_managing_share_links_requires_a_session(ada: User, method: str, path: str) -> None:
    work = projects.create_project(ada, "Work")
    link = share_links.create_share_link(ada, work.pk)

    response = getattr(Client(), method)(path.format(project=work.pk, link=link.pk))

    assert response.status_code == 401
    link.refresh_from_db()
    assert link.is_active
