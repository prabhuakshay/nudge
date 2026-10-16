"""Request and response shapes for the Calendar View's range query."""

from __future__ import annotations

from datetime import date  # noqa: TC003 - Pydantic needs the type at runtime

from ninja import Field, Schema

from apps.tasks.schemas.tasks import TaskOut  # noqa: TC001 - Pydantic needs the type at runtime


class CalendarQuery(Schema):
    """The days the Calendar shows, both included."""

    start: date = Field(description="The first day shown.")
    end: date = Field(description="The last day shown; at most 42 days after `start`, counted in.")


class CalendarOut(Schema):
    """The Tasks a range of days shows."""

    items: list[TaskOut] = Field(
        description="Open and Closed Tasks whose dates overlap the range, Subtasks as their own "
        "rows, by the day they start.",
    )
