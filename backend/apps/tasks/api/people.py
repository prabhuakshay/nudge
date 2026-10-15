"""People endpoints: list the address book, add a Person, rename, delete and merge one."""

from __future__ import annotations

from typing import TYPE_CHECKING

from ninja import Router, Status

from apps.accounts.schemas import ErrorOut
from apps.tasks import people
from apps.tasks.api import signed_in_user
from apps.tasks.people import PersonRuleError
from apps.tasks.schemas.people import PersonIn, PersonMergeIn, PersonOut, PersonPatchIn

if TYPE_CHECKING:
    from django.http import HttpRequest

router = Router()

_HTTP_OK = 200
_HTTP_CREATED = 201
_HTTP_NO_CONTENT = 204
_HTTP_NOT_FOUND = 404
_HTTP_UNPROCESSABLE = 422
_PERSON_NOT_FOUND = ErrorOut(detail="Person not found.")


@router.get("", response=list[PersonOut], summary="List People")
def list_people(request: HttpRequest) -> list[PersonOut]:
    """Return the user's People, A to Z."""
    return [PersonOut.from_orm(found) for found in people.people(signed_in_user(request))]


@router.post(
    "",
    response={_HTTP_CREATED: PersonOut, _HTTP_UNPROCESSABLE: ErrorOut},
    summary="Add a Person",
)
def create_person(request: HttpRequest, person: PersonIn) -> Status[PersonOut] | Status[ErrorOut]:
    """Add a Person to the address book."""
    try:
        created = people.create_person(signed_in_user(request), person.name, color=person.color)
    except PersonRuleError as error:
        return Status(_HTTP_UNPROCESSABLE, ErrorOut(detail=str(error)))
    return Status(_HTTP_CREATED, PersonOut.from_orm(created))


@router.patch(
    "/{int:person_id}",
    response={_HTTP_OK: PersonOut, _HTTP_NOT_FOUND: ErrorOut, _HTTP_UNPROCESSABLE: ErrorOut},
    summary="Change a Person",
)
def update_person(
    request: HttpRequest,
    person_id: int,
    patch: PersonPatchIn,
) -> Status[PersonOut] | Status[ErrorOut]:
    """Rename or recolour a Person. A rename shows in every Mention of them."""
    try:
        found = people.update_person(
            signed_in_user(request),
            person_id,
            name=patch.name,
            color=patch.color,
        )
    except PersonRuleError as error:
        return Status(_HTTP_UNPROCESSABLE, ErrorOut(detail=str(error)))
    if found is None:
        return Status(_HTTP_NOT_FOUND, _PERSON_NOT_FOUND)
    return Status(_HTTP_OK, PersonOut.from_orm(found))


@router.delete(
    "/{int:person_id}",
    response={_HTTP_NO_CONTENT: None, _HTTP_NOT_FOUND: ErrorOut},
    summary="Delete a Person",
)
def delete_person(request: HttpRequest, person_id: int) -> Status[None] | Status[ErrorOut]:
    """Delete a Person for good; their Mentions become plain `@Name` text."""
    if not people.delete_person(signed_in_user(request), person_id):
        return Status(_HTTP_NOT_FOUND, _PERSON_NOT_FOUND)
    return Status(_HTTP_NO_CONTENT, None)


@router.post(
    "/{int:person_id}/merge",
    response={_HTTP_OK: PersonOut, _HTTP_NOT_FOUND: ErrorOut, _HTTP_UNPROCESSABLE: ErrorOut},
    summary="Merge a Person into another",
)
def merge_person(
    request: HttpRequest,
    person_id: int,
    merge: PersonMergeIn,
) -> Status[PersonOut] | Status[ErrorOut]:
    """Fold a Person into another: their Mentions move over and they are deleted."""
    try:
        merged = people.merge_person(signed_in_user(request), person_id, merge.into_id)
    except PersonRuleError as error:
        return Status(_HTTP_UNPROCESSABLE, ErrorOut(detail=str(error)))
    if merged is None:
        return Status(_HTTP_NOT_FOUND, _PERSON_NOT_FOUND)
    return Status(_HTTP_OK, PersonOut.from_orm(merged))
