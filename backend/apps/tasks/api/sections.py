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
from apps.tasks import live, sections
from apps.tasks.schemas.sections import SectionIn, SectionMoveIn, SectionOut, SectionPatchIn

if TYPE_CHECKING:
    from django.http import HttpRequest

router = Router()


@router.get(
    "/projects/{int:project_id}/sections",
    response={HTTPStatus.OK: list[SectionOut], HTTPStatus.NOT_FOUND: ErrorOut},
    summary="List a Project's Sections",
)
def list_sections(request: HttpRequest, project_id: int) -> Status[list[SectionOut]]:
    """List a Project's Sections in order. The Inbox has none."""
    found = sections.project_sections(live.project(signed_in_user(request), project_id))
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
def create_section(request: HttpRequest, project_id: int, section: SectionIn) -> Status[SectionOut]:
    """Add an expanded Section after another one, or last. The Inbox can't have Sections."""
    project = live.project(signed_in_user(request), project_id)
    created = sections.create_section(project, section.name, section.after_id)
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
) -> Status[SectionOut]:
    """Rename a Section, or collapse or expand it."""
    updated = sections.update_section(
        signed_in_user(request), section_id, name=patch.name, collapsed=patch.collapsed
    )
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
def move_section(request: HttpRequest, section_id: int, move: SectionMoveIn) -> Status[None]:
    """Put a Section right after another one in the same Project, or first."""
    sections.move_section(signed_in_user(request), section_id, move.after_id)
    return Status(HTTPStatus.NO_CONTENT, None)


@router.delete(
    "/sections/{int:section_id}",
    response={
        HTTPStatus.NO_CONTENT: None,
        HTTPStatus.NOT_FOUND: ErrorOut,
        HTTPStatus.UNPROCESSABLE_ENTITY: ErrorOut,
    },
    summary="Delete a Section",
)
def delete_section(request: HttpRequest, section_id: int) -> Status[None]:
    """Delete a Section for good. Its Tasks stay in the Project, in No section."""
    sections.delete_section(signed_in_user(request), section_id)
    return Status(HTTPStatus.NO_CONTENT, None)
