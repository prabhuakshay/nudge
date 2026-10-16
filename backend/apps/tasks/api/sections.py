"""Section endpoints: list and add a Project's Sections, change, reorder and delete them.

Mounted at the API root because a Project's Sections live under `/projects/{id}/sections` while
a single Section lives under `/sections/{id}`.
"""

from __future__ import annotations

from http import HTTPStatus
from typing import TYPE_CHECKING

from ninja import Router, Status

from apps.core.auth import signed_in_user
from apps.core.schemas import ErrorOut
from apps.tasks import sections, services
from apps.tasks.api.errors import PROJECT_NOT_FOUND, SECTION_NOT_FOUND
from apps.tasks.schemas.sections import SectionIn, SectionMoveIn, SectionOut, SectionPatchIn

if TYPE_CHECKING:
    from django.http import HttpRequest

router = Router()


@router.get(
    "/projects/{int:project_id}/sections",
    response={HTTPStatus.OK: list[SectionOut], HTTPStatus.NOT_FOUND: ErrorOut},
    summary="List a Project's Sections",
)
def list_sections(
    request: HttpRequest, project_id: int
) -> Status[list[SectionOut]] | Status[ErrorOut]:
    """List a Project's Sections in order. The Inbox has none."""
    project = services.live_project(signed_in_user(request), project_id)
    if project is None:
        return Status(HTTPStatus.NOT_FOUND, PROJECT_NOT_FOUND)
    found = sections.project_sections(project)
    return Status(HTTPStatus.OK, [SectionOut.from_orm(section) for section in found])


@router.post(
    "/projects/{int:project_id}/sections",
    response={
        HTTPStatus.CREATED: SectionOut,
        HTTPStatus.NOT_FOUND: ErrorOut,
        HTTPStatus.UNPROCESSABLE_ENTITY: ErrorOut,
    },
    summary="Add a Section to a Project",
)
def create_section(
    request: HttpRequest, project_id: int, section: SectionIn
) -> Status[SectionOut] | Status[ErrorOut]:
    """Add an expanded Section after another one, or last. The Inbox can't have Sections."""
    user = signed_in_user(request)
    project = services.live_project(user, project_id)
    if project is None:
        return Status(HTTPStatus.NOT_FOUND, PROJECT_NOT_FOUND)
    after = None
    if section.after_id is not None:
        after = sections.section(user, section.after_id)
        if after is None:
            return Status(HTTPStatus.NOT_FOUND, SECTION_NOT_FOUND)
    created = sections.create_section(project, section.name, after)
    return Status(HTTPStatus.CREATED, SectionOut.from_orm(created))


@router.patch(
    "/sections/{int:section_id}",
    response={
        HTTPStatus.OK: SectionOut,
        HTTPStatus.NOT_FOUND: ErrorOut,
        HTTPStatus.UNPROCESSABLE_ENTITY: ErrorOut,
    },
    summary="Change a Section",
)
def update_section(
    request: HttpRequest, section_id: int, patch: SectionPatchIn
) -> Status[SectionOut] | Status[ErrorOut]:
    """Rename a Section, or collapse or expand it."""
    found = sections.section(signed_in_user(request), section_id)
    if found is None:
        return Status(HTTPStatus.NOT_FOUND, SECTION_NOT_FOUND)
    updated = sections.update_section(found, name=patch.name, collapsed=patch.collapsed)
    return Status(HTTPStatus.OK, SectionOut.from_orm(updated))


@router.post(
    "/sections/{int:section_id}/move",
    response={
        HTTPStatus.NO_CONTENT: None,
        HTTPStatus.NOT_FOUND: ErrorOut,
        HTTPStatus.UNPROCESSABLE_ENTITY: ErrorOut,
    },
    summary="Move a Section in its Project",
)
def move_section(
    request: HttpRequest, section_id: int, move: SectionMoveIn
) -> Status[None] | Status[ErrorOut]:
    """Put a Section right after another one in the same Project, or first."""
    user = signed_in_user(request)
    moved = sections.section(user, section_id)
    if moved is None:
        return Status(HTTPStatus.NOT_FOUND, SECTION_NOT_FOUND)
    after = None
    if move.after_id is not None:
        after = sections.section(user, move.after_id)
        if after is None:
            return Status(HTTPStatus.NOT_FOUND, SECTION_NOT_FOUND)
    sections.move_section(moved, after)
    return Status(HTTPStatus.NO_CONTENT, None)


@router.delete(
    "/sections/{int:section_id}",
    response={HTTPStatus.NO_CONTENT: None, HTTPStatus.NOT_FOUND: ErrorOut},
    summary="Delete a Section",
)
def delete_section(request: HttpRequest, section_id: int) -> Status[None] | Status[ErrorOut]:
    """Delete a Section for good. Its Tasks stay in the Project, in No section."""
    if not sections.delete_section(signed_in_user(request), section_id):
        return Status(HTTPStatus.NOT_FOUND, SECTION_NOT_FOUND)
    return Status(HTTPStatus.NO_CONTENT, None)
