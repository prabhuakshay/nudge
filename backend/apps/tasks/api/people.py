"""People endpoints: list the address book, add a Person, rename, delete and merge one."""

from __future__ import annotations

from http import HTTPStatus
from typing import TYPE_CHECKING

from ninja import Router, Status

from apps.core.auth import signed_in_user
from apps.core.schemas import ErrorOut
from apps.tasks import people
from apps.tasks.api.errors import PERSON_NOT_FOUND
from apps.tasks.schemas.people import PersonIn, PersonMergeIn, PersonOut, PersonPatchIn

if TYPE_CHECKING:
    from django.http import HttpRequest

router = Router()


@router.get("", response={HTTPStatus.OK: list[PersonOut]}, summary="List People")
def list_people(request: HttpRequest) -> Status[list[PersonOut]]:
    """Return the user's People, A to Z."""
    found = people.people(signed_in_user(request))
    return Status(HTTPStatus.OK, [PersonOut.from_orm(person) for person in found])


@router.post(
    "",
    response={HTTPStatus.CREATED: PersonOut, HTTPStatus.UNPROCESSABLE_ENTITY: ErrorOut},
    summary="Add a Person",
)
def create_person(request: HttpRequest, person: PersonIn) -> Status[PersonOut] | Status[ErrorOut]:
    """Add a Person to the address book."""
    created = people.create_person(signed_in_user(request), person.name, color=person.color)
    return Status(HTTPStatus.CREATED, PersonOut.from_orm(created))


@router.patch(
    "/{int:person_id}",
    response={
        HTTPStatus.OK: PersonOut,
        HTTPStatus.NOT_FOUND: ErrorOut,
        HTTPStatus.UNPROCESSABLE_ENTITY: ErrorOut,
    },
    summary="Change a Person",
)
def update_person(
    request: HttpRequest,
    person_id: int,
    patch: PersonPatchIn,
) -> Status[PersonOut] | Status[ErrorOut]:
    """Rename or recolour a Person. A rename shows in every Mention of them."""
    found = people.update_person(
        signed_in_user(request),
        person_id,
        name=patch.name,
        color=patch.color,
    )
    if found is None:
        return Status(HTTPStatus.NOT_FOUND, PERSON_NOT_FOUND)
    return Status(HTTPStatus.OK, PersonOut.from_orm(found))


@router.delete(
    "/{int:person_id}",
    response={HTTPStatus.NO_CONTENT: None, HTTPStatus.NOT_FOUND: ErrorOut},
    summary="Delete a Person",
)
def delete_person(request: HttpRequest, person_id: int) -> Status[None] | Status[ErrorOut]:
    """Delete a Person for good; their Mentions become plain `@Name` text."""
    if not people.delete_person(signed_in_user(request), person_id):
        return Status(HTTPStatus.NOT_FOUND, PERSON_NOT_FOUND)
    return Status(HTTPStatus.NO_CONTENT, None)


@router.post(
    "/{int:person_id}/merge",
    response={
        HTTPStatus.OK: PersonOut,
        HTTPStatus.NOT_FOUND: ErrorOut,
        HTTPStatus.UNPROCESSABLE_ENTITY: ErrorOut,
    },
    summary="Merge a Person into another",
)
def merge_person(
    request: HttpRequest,
    person_id: int,
    merge: PersonMergeIn,
) -> Status[PersonOut] | Status[ErrorOut]:
    """Fold a Person into another: their Mentions move over and they are deleted."""
    merged = people.merge_person(signed_in_user(request), person_id, merge.into_id)
    if merged is None:
        return Status(HTTPStatus.NOT_FOUND, PERSON_NOT_FOUND)
    return Status(HTTPStatus.OK, PersonOut.from_orm(merged))
