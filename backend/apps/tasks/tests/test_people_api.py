"""Tests for the People endpoints."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from django.test import Client

from apps.core.palette import PaletteColor
from apps.tasks import people

if TYPE_CHECKING:
    from django.test.client import _MonkeyPatchedWSGIResponse as Response

    from apps.accounts.models import User


def _post(client: Client, path: str, data: object) -> Response:
    return client.post(path, data, content_type="application/json")


def _patch(client: Client, path: str, data: object) -> Response:
    return client.patch(path, data, content_type="application/json")


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("get", "/api/v1/people"),
        ("post", "/api/v1/people"),
        ("patch", "/api/v1/people/1"),
        ("delete", "/api/v1/people/1"),
        ("post", "/api/v1/people/1/merge"),
    ],
)
def test_every_endpoint_requires_a_session(method: str, path: str) -> None:
    response = getattr(Client(), method)(path)

    assert response.status_code == 401


@pytest.mark.django_db
def test_create_makes_a_person_with_a_palette_colour(client: Client) -> None:
    response = _post(client, "/api/v1/people", {"name": "  Ada Byron "})

    assert response.status_code == 201
    body = response.json()
    assert body == {"id": body["id"], "name": "Ada Byron", "color": body["color"]}
    assert body["color"] in PaletteColor.values


@pytest.mark.django_db
@pytest.mark.parametrize("name", ["", "  ", "x" * 65, "@Sam", "Sam [x]", "Sam (work)"])
def test_create_rejects_a_blank_overlong_or_token_breaking_name(client: Client, name: str) -> None:
    response = _post(client, "/api/v1/people", {"name": name})

    assert response.status_code == 422


@pytest.mark.django_db
def test_create_rejects_a_name_taken_in_any_case(client: Client, ada: User) -> None:
    people.create_person(ada, "Priya")

    response = _post(client, "/api/v1/people", {"name": "PRIYA"})

    assert response.status_code == 422
    assert response.json() == {"detail": "You already have a Person named “PRIYA”."}


@pytest.mark.django_db
def test_another_user_may_use_the_same_name(client: Client, grace: User) -> None:
    people.create_person(grace, "Priya")

    response = _post(client, "/api/v1/people", {"name": "Priya"})

    assert response.status_code == 201


@pytest.mark.django_db
def test_list_returns_only_my_people_a_to_z_ignoring_case(
    client: Client,
    ada: User,
    grace: User,
) -> None:
    for name in ["sam", "Mum", "Ada", "Zed"]:
        people.create_person(ada, name)
    people.create_person(grace, "Bea")

    response = client.get("/api/v1/people")

    assert response.status_code == 200
    assert [person["name"] for person in response.json()] == ["Ada", "Mum", "sam", "Zed"]


@pytest.mark.django_db
def test_patch_renames_and_recolours_a_person(client: Client, ada: User) -> None:
    person = people.create_person(ada, "Sam", color=PaletteColor.RED)

    response = _patch(client, f"/api/v1/people/{person.pk}", {"name": "Samira", "color": "teal"})

    assert response.status_code == 200
    assert response.json() == {"id": person.pk, "name": "Samira", "color": "teal"}


@pytest.mark.django_db
def test_patch_may_change_only_the_case_of_a_name(client: Client, ada: User) -> None:
    person = people.create_person(ada, "sam")

    response = _patch(client, f"/api/v1/people/{person.pk}", {"name": "Sam"})

    assert response.status_code == 200
    assert response.json()["name"] == "Sam"


@pytest.mark.django_db
def test_patch_rejects_another_persons_name(client: Client, ada: User) -> None:
    people.create_person(ada, "Priya")
    sam = people.create_person(ada, "Sam")

    response = _patch(client, f"/api/v1/people/{sam.pk}", {"name": "priya"})

    assert response.status_code == 422


@pytest.mark.django_db
def test_patch_cannot_reach_another_users_person(client: Client, grace: User) -> None:
    person = people.create_person(grace, "Sam")

    response = _patch(client, f"/api/v1/people/{person.pk}", {"name": "Mine now"})

    assert response.status_code == 404
    person.refresh_from_db()
    assert person.name == "Sam"


@pytest.mark.django_db
def test_delete_removes_a_person(client: Client, ada: User) -> None:
    person = people.create_person(ada, "Sam")

    response = client.delete(f"/api/v1/people/{person.pk}")

    assert response.status_code == 204
    assert client.get("/api/v1/people").json() == []


@pytest.mark.django_db
def test_delete_cannot_reach_another_users_person(client: Client, grace: User) -> None:
    person = people.create_person(grace, "Sam")

    response = client.delete(f"/api/v1/people/{person.pk}")

    assert response.status_code == 404
    assert grace.people.count() == 1


@pytest.mark.django_db
def test_patch_leaves_fields_it_was_not_given(client: Client, ada: User) -> None:
    person = people.create_person(ada, "Sam", color=PaletteColor.RED)

    response = _patch(client, f"/api/v1/people/{person.pk}", {"color": "blue"})

    assert response.json() == {"id": person.pk, "name": "Sam", "color": "blue"}
