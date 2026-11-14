"""Response shapes for the public report a Share link shows.

They carry only what the viewer reads, never ids or settings of the owner's other data.
"""

from __future__ import annotations

from datetime import date, datetime, time  # noqa: TC003 - Pydantic needs the types at runtime

from ninja import Field, Schema

from apps.tasks.models import Task  # noqa: TC001 - Pydantic needs the type at runtime


class ShareReportProjectOut(Schema):
    """The shared Project, as the report's header shows it."""

    name: str
    is_archived: bool


class ShareReportAttachmentOut(Schema):
    """A file on a Task of the report, downloaded through the Share link by its id."""

    id: int
    name: str
    size: int = Field(description="The file's size in bytes.")


class ShareReportCommentOut(Schema):
    """A Comment on a Task of the report, with Mentions as plain names."""

    id: int
    at: datetime = Field(description="When it was written, in the owner's time zone.")
    body: str = Field(description="Markdown.")


class ShareReportTaskOut(Schema):
    """One Task on the report with its Subtasks, Mentions as plain names."""

    id: int
    title: str
    status: Task.Status
    priority: Task.Priority
    due_date: date | None
    due_time: time | None
    start_date: date | None
    start_time: time | None
    is_overdue: bool
    tags: list[str] = Field(description="The names of the Task's Tags.")
    description: str
    blocked_reason: str
    attachments: list[ShareReportAttachmentOut] = Field(description="Oldest first.")
    comments: list[ShareReportCommentOut] = Field(
        description="The Task's Comments within the link's range, oldest first."
    )
    subtasks: list[ShareReportTaskOut] = Field(
        description="Open ones in List order, then Closed ones within the link's range."
    )


class ShareReportSectionOut(Schema):
    """A group of the report's Tasks, under a plain heading."""

    name: str | None = Field(description="The Section's name; null for Tasks outside any Section.")
    tasks: list[ShareReportTaskOut] = Field(description="The Section's top-level Tasks.")


class ShareReportSummaryOut(Schema):
    """How the report's Tasks stand, counted over every Task it shows, Subtasks included."""

    completed: int
    total: int
    blocked: int
    overdue: int


class ShareReportOut(Schema):
    """The whole report a Share link shows, as the Project is now."""

    project: ShareReportProjectOut
    summary: ShareReportSummaryOut
    sections: list[ShareReportSectionOut] = Field(
        description="No section first, then each Section in List order; empty ones are left out."
    )
