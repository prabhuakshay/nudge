"""Tag endpoints: create one, change it, order it, merge it into another and delete it."""

from __future__ import annotations

from typing import TYPE_CHECKING

from ninja import Router, Status

from apps.core.auth import signed_in_user
from apps.core.schemas import ErrorOut
from apps.tasks import tags
from apps.tasks.schemas.tags import TagIn, TagMergeIn, TagMoveIn, TagOut, TagPatchIn

if TYPE_CHECKING:
    from django.http import HttpRequest

router = Router()

_HTTP_OK = 200
_HTTP_CREATED = 201
_HTTP_NO_CONTENT = 204
_HTTP_NOT_FOUND = 404
_HTTP_UNPROCESSABLE = 422
_TAG_NOT_FOUND = ErrorOut(detail="Tag not found.")


@router.post(
    "",
    response={_HTTP_CREATED: TagOut, _HTTP_UNPROCESSABLE: ErrorOut},
    summary="Create a Tag",
)
def create_tag(request: HttpRequest, tag: TagIn) -> Status[TagOut] | Status[ErrorOut]:
    """Create a Tag last in the user's order."""
    created = tags.create_tag(signed_in_user(request), tag.name, color=tag.color)
    return Status(_HTTP_CREATED, TagOut.from_orm(created))


@router.patch(
    "/{int:tag_id}",
    response={_HTTP_OK: TagOut, _HTTP_NOT_FOUND: ErrorOut, _HTTP_UNPROCESSABLE: ErrorOut},
    summary="Change a Tag",
)
def update_tag(
    request: HttpRequest,
    tag_id: int,
    patch: TagPatchIn,
) -> Status[TagOut] | Status[ErrorOut]:
    """Rename or recolour a Tag; the new name shows on every Task that has it."""
    clears_color = "color" in patch.model_fields_set and patch.color is None
    updated = tags.update_tag(
        signed_in_user(request),
        tag_id,
        name=patch.name,
        color="" if clears_color else patch.color,
    )
    if updated is None:
        return Status(_HTTP_NOT_FOUND, _TAG_NOT_FOUND)
    return Status(_HTTP_OK, TagOut.from_orm(updated))


@router.post(
    "/{int:tag_id}/move",
    response={_HTTP_NO_CONTENT: None, _HTTP_NOT_FOUND: ErrorOut},
    summary="Move a Tag in the user's order",
)
def move_tag(request: HttpRequest, tag_id: int, move: TagMoveIn) -> Status[None] | Status[ErrorOut]:
    """Put a Tag right after another, or first."""
    if not tags.move_tag(signed_in_user(request), tag_id, move.after_id):
        return Status(_HTTP_NOT_FOUND, _TAG_NOT_FOUND)
    return Status(_HTTP_NO_CONTENT, None)


@router.post(
    "/{int:tag_id}/merge",
    response={_HTTP_NO_CONTENT: None, _HTTP_NOT_FOUND: ErrorOut, _HTTP_UNPROCESSABLE: ErrorOut},
    summary="Merge a Tag into another",
)
def merge_tag(
    request: HttpRequest,
    tag_id: int,
    merge: TagMergeIn,
) -> Status[None] | Status[ErrorOut]:
    """Move every Task of a Tag onto another Tag, then delete the first for good."""
    merged = tags.merge_tag(signed_in_user(request), tag_id, merge.into_id)
    if not merged:
        return Status(_HTTP_NOT_FOUND, _TAG_NOT_FOUND)
    return Status(_HTTP_NO_CONTENT, None)


@router.delete(
    "/{int:tag_id}",
    response={_HTTP_NO_CONTENT: None, _HTTP_NOT_FOUND: ErrorOut},
    summary="Delete a Tag",
)
def delete_tag(request: HttpRequest, tag_id: int) -> Status[None] | Status[ErrorOut]:
    """Delete a Tag for good, taking it off every Task that has it."""
    if not tags.delete_tag(signed_in_user(request), tag_id):
        return Status(_HTTP_NOT_FOUND, _TAG_NOT_FOUND)
    return Status(_HTTP_NO_CONTENT, None)
