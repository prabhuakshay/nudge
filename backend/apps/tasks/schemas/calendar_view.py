"""Request and response shapes for the Calendar View's range query."""

from __future__ import annotations

from datetime import date  # noqa: TC003 - Pydantic needs the type at runtime

from ninja import Field, Schema

from apps.tasks.schemas.tasks import TaskOut  # noqa: TC001 - Pydantic needs the type at runtime


class CalendarQuery(Schema):
    """The days the Calendar shows, both included."""

    start: date = Field(description="The first day shown.")
    end: date = Field(description="The last day shown; at most 42 days after `start`, counted in.")


class OccurrenceOut(Schema):
    """A later Occurrence of a repeating Task: a day it will come back on."""

    task_id: int
    date: date


class CalendarOut(Schema):
    """The Tasks a range of days shows."""

    items: list[TaskOut] = Field(
        description="Open and Closed Tasks whose dates overlap the range, Subtasks as their own "
        "rows, by the day they start.",
    )
    occurrences: list[OccurrenceOut] = Field(
        description="The days in the range that repeating Tasks come back on after their current "
        "Occurrence, by Task then day. Repeat from completion Tasks have none.",
    )
    repeating: list[TaskOut] = Field(
        description="The Tasks the Occurrences belong to, whose current Occurrence may be outside "
        "the range.",
    )
