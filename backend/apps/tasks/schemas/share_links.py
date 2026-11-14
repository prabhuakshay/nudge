"""Request and response shapes for the owner's Share link endpoints."""

from __future__ import annotations

from datetime import datetime  # noqa: TC003 - Pydantic needs the type at runtime

from ninja import Field, Schema

from apps.tasks.share_links import DEFAULT_EXPIRY_DAYS, DEFAULT_RANGE_DAYS


class ShareLinkOut(Schema):
    """A Share link, as its owner sees it in the Share panel."""

    id: int
    project_id: int
    url: str = Field(description="The public address of the report. Anyone with it can open it.")
    created_at: datetime
    expires_at: datetime | None = Field(description="When it stops working; null for never.")
    range_days: int | None = Field(
        description="How many days back each Task's timeline goes; null for all."
    )
    last_opened_at: datetime | None = Field(description="Null until someone opens it.")


class ShareLinkIn(Schema):
    """The settings of a new Share link; fields left out take their defaults."""

    expires_in_days: int | None = Field(
        default=DEFAULT_EXPIRY_DAYS,
        description="Days from now until it stops working; null for never.",
    )
    range_days: int | None = Field(
        default=DEFAULT_RANGE_DAYS,
        description="Days of each Task's timeline to show: 7, 14 or 30; null for all.",
    )


class ShareLinkPatchIn(Schema):
    """The settings of a Share link to change; fields left out stay as they are."""

    expires_in_days: int | None = Field(
        default=None, description="Days from now until it stops working; null for never."
    )
    range_days: int | None = Field(
        default=None, description="Days of each Task's timeline to show: 7, 14 or 30; null for all."
    )
