"""Tag endpoints: create one, change it, order it, merge it into another and delete it."""

from __future__ import annotations

from http import HTTPStatus
from typing import TYPE_CHECKING

from ninja import Router, Status

from apps.core.auth import signed_in_user
from apps.core.schemas import ErrorOut
from apps.tasks import tags
from apps.tasks.schemas.tags import TagIn, TagMergeIn, TagMoveIn, TagOut, TagPatchIn

if TYPE_CHECKING:
    from django.http import HttpRequest

router = Router()


@router.post(
    "",
    response={HTTPStatus.CREATED: TagOut, HTTPStatus.UNPROCESSABLE_ENTITY: ErrorOut},
    summary="Create a Tag",
)
def create_tag(request: HttpRequest, tag: TagIn) -> Status[TagOut] | Status[ErrorOut]:
    """Create a Tag last in the user's order."""
    created = tags.create_tag(signed_in_user(request), tag.name, color=tag.color)
    return Status(HTTPStatus.CREATED, TagOut.from_orm(created))


@router.patch(
    "/{int:tag_id}",
    response={
        HTTPStatus.OK: TagOut,
        HTTPStatus.NOT_FOUND: ErrorOut,
        HTTPStatus.UNPROCESSABLE_ENTITY: ErrorOut,
    },
    summary="Change a Tag",
)
def update_tag(
    request: HttpRequest,
    tag_id: int,
    patch: TagPatchIn,
) -> Status[TagOut]:
    """Rename or recolour a Tag; the new name shows on every Task that has it."""
    clears_color = "color" in patch.model_fields_set and patch.color is None
    updated = tags.update_tag(
        signed_in_user(request),
        tag_id,
        name=patch.name,
        color="" if clears_color else patch.color,
    )
    return Status(HTTPStatus.OK, TagOut.from_orm(updated))


@router.post(
    "/{int:tag_id}/move",
    response={HTTPStatus.NO_CONTENT: None, HTTPStatus.NOT_FOUND: ErrorOut},
    summary="Move a Tag in the user's order",
)
def move_tag(request: HttpRequest, tag_id: int, move: TagMoveIn) -> Status[None]:
    """Put a Tag right after another, or first."""
    tags.move_tag(signed_in_user(request), tag_id, move.after_id)
    return Status(HTTPStatus.NO_CONTENT, None)


@router.post(
    "/{int:tag_id}/merge",
    response={
        HTTPStatus.NO_CONTENT: None,
        HTTPStatus.NOT_FOUND: ErrorOut,
        HTTPStatus.UNPROCESSABLE_ENTITY: ErrorOut,
    },
    summary="Merge a Tag into another",
)
def merge_tag(
    request: HttpRequest,
    tag_id: int,
    merge: TagMergeIn,
) -> Status[None]:
    """Move every Task of a Tag onto another Tag, then delete the first for good."""
    tags.merge_tag(signed_in_user(request), tag_id, merge.into_id)
    return Status(HTTPStatus.NO_CONTENT, None)


@router.delete(
    "/{int:tag_id}",
    response={HTTPStatus.NO_CONTENT: None, HTTPStatus.NOT_FOUND: ErrorOut},
    summary="Delete a Tag",
)
def delete_tag(request: HttpRequest, tag_id: int) -> Status[None]:
    """Delete a Tag for good, taking it off every Task that has it."""
    tags.delete_tag(signed_in_user(request), tag_id)
    return Status(HTTPStatus.NO_CONTENT, None)
