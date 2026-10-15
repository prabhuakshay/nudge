"""Response shapes for the Calendar feed endpoints."""

from __future__ import annotations

from ninja import Field, Schema


class CalendarFeedOut(Schema):
    """The user's Calendar feed address."""

    url: str | None = Field(description="The private `.ics` address, or null while it's off.")
