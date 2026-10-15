"""Response shapes for a Task's Repeat events in its Activity history."""

from __future__ import annotations

from datetime import date, datetime  # noqa: TC003 - Pydantic needs the types at runtime
from typing import Literal

from ninja import Field, Schema

from apps.tasks.models import Task  # noqa: TC001 - Pydantic needs the type at runtime


class RepeatData(Schema):
    """A Task's Repeat at one moment, as a change recorded it."""

    rule: str = Field(description="An RFC 5545 RRULE.")
    repeat_from: Task.RepeatFrom


class RepeatChangedData(Schema):
    """The Repeat before and after a change; null when the Task didn't or doesn't repeat."""

    old: RepeatData | None
    new: RepeatData | None


class RepeatChangedActivityOut(Schema):
    """The Task's Repeat was set, changed or stopped."""

    id: int
    kind: Literal["repeat_changed"]
    at: datetime
    data: RepeatChangedData


class RepeatRemovedActivityOut(Schema):
    """The Task stopped repeating because it lost its due date or became a Subtask."""

    id: int
    kind: Literal["repeat_removed"]
    at: datetime
    data: RepeatData


class RepeatAdvancedData(Schema):
    """Which Occurrence was closed, how, and the one the Task moved on to."""

    action: Literal["completed", "skipped"] = Field(description="Skipped is Won't do.")
    occurrence: date
    next: date


class RepeatAdvancedActivityOut(Schema):
    """Closing the repeating Task moved it on to its next Occurrence."""

    id: int
    kind: Literal["repeat_advanced"]
    at: datetime
    data: RepeatAdvancedData
