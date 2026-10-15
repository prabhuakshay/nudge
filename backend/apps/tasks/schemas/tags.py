"""Request and response shapes for the Tag endpoints, and Tags as Tasks and Activity show them."""

from __future__ import annotations

from datetime import datetime  # noqa: TC003 - Pydantic needs the type at runtime
from typing import Annotated, Literal

from ninja import Field, Schema
from pydantic import StringConstraints, field_validator

from apps.core.palette import PaletteColor  # noqa: TC001 - Pydantic needs the type at runtime

TagName = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=64, pattern=r"^[^\s#]+$"),
]


class TagOut(Schema):
    """A Tag's own fields."""

    id: int
    name: str
    color: PaletteColor | None = Field(description="Null shows the Tag grey.")

    @field_validator("color", mode="before")
    @classmethod
    def _grey_is_null(cls, value: str | None) -> str | None:
        """Return None for a grey Tag, which the model stores as ""."""
        return value or None


class TagData(Schema):
    """The Tag an event is about, by the name it had."""

    name: str


class TagAddedActivityOut(Schema):
    """A Tag was put on the Task."""

    id: int
    kind: Literal["tag_added"]
    at: datetime
    data: TagData


class TagRemovedActivityOut(Schema):
    """A Tag was taken off the Task, or deleted."""

    id: int
    kind: Literal["tag_removed"]
    at: datetime
    data: TagData


class TagsMergedData(Schema):
    """The Tags of a merge, by the names they had."""

    from_tag: str
    into_tag: str


class TagsMergedActivityOut(Schema):
    """One of the Task's Tags was merged into another."""

    id: int
    kind: Literal["tags_merged"]
    at: datetime
    data: TagsMergedData


class TagIn(Schema):
    """A new Tag."""

    name: TagName
    color: PaletteColor | None = Field(default=None, description="Grey when left out.")


class TagPatchIn(Schema):
    """The fields of a Tag to change; fields left out stay as they are."""

    name: TagName | None = None
    color: PaletteColor | None = Field(default=None, description="Null makes the Tag grey.")


class TagMoveIn(Schema):
    """Where a Tag goes in the user's order."""

    after_id: int | None = Field(
        default=None,
        description="The Tag it now follows; first when null, last when it isn't there.",
    )


class TagMergeIn(Schema):
    """The Tag to merge into."""

    into_id: int


class SidebarTagOut(TagOut):
    """A Tag as the sidebar lists it."""

    open_count: int = Field(description="Open and Blocked Tasks with the Tag.")
    task_count: int = Field(description="Tasks with the Tag that aren't in Trash, closed too.")
