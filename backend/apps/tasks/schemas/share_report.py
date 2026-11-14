"""Response shapes for the public report a Share link shows.

They carry only what the viewer reads, never ids or settings of the owner's other data.
"""

from __future__ import annotations

from datetime import datetime  # noqa: TC003 - Pydantic needs the type at runtime

from ninja import Field, Schema


class ShareReportProjectOut(Schema):
    """The shared Project, as the report's header shows it."""

    name: str
    is_archived: bool


class ShareReportTaskOut(Schema):
    """One Task on the report."""

    id: int
    title: str


class ShareReportSectionOut(Schema):
    """A group of the report's Tasks, under a plain heading."""

    name: str | None = Field(description="The Section's name; null for Tasks outside any Section.")
    tasks: list[ShareReportTaskOut]


class ShareReportOut(Schema):
    """The whole report a Share link shows, as the Project is now."""

    project: ShareReportProjectOut
    as_of: datetime = Field(description="When the report was made, in the owner's time zone.")
    sections: list[ShareReportSectionOut] = Field(description="Groups of open Tasks, in order.")
