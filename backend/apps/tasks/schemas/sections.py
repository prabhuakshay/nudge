"""Request and response shapes for the Section endpoints."""

from __future__ import annotations

from ninja import Field, Schema

from apps.tasks.models import SECTION_NAME_MAX_LENGTH

# The service checks names, so a blank or overlong one is refused with a readable reason.
NAME_DESCRIPTION = f"1 to {SECTION_NAME_MAX_LENGTH} characters, surrounding spaces trimmed."


class SectionOut(Schema):
    """A Section's own fields."""

    id: int
    project_id: int
    name: str
    collapsed: bool


class SectionIn(Schema):
    """A new Section."""

    name: str = Field(description=NAME_DESCRIPTION)
    after_id: int | None = Field(
        default=None,
        description="The Section it follows in the Project; last when left out.",
    )


class SectionPatchIn(Schema):
    """The fields of a Section to change; fields left out stay as they are."""

    name: str | None = Field(default=None, description=NAME_DESCRIPTION)
    collapsed: bool | None = None
