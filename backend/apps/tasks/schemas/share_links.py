"""Response shapes for the owner's Share link endpoints."""

from __future__ import annotations

from datetime import datetime  # noqa: TC003 - Pydantic needs the type at runtime

from ninja import Field, Schema


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
