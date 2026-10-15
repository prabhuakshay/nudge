"""Request and response shapes for Reminders, which travel inside the Task endpoints."""

from __future__ import annotations

from datetime import datetime  # noqa: TC003 - Pydantic needs the type at runtime
from typing import TYPE_CHECKING, Annotated, Literal

from ninja import Field, Schema

from apps.tasks.reminders import MAX_OFFSET

if TYPE_CHECKING:
    from apps.tasks.models import Reminder

_MAX_MINUTES = int(MAX_OFFSET.total_seconds()) // 60

ReminderOffset = Annotated[
    int,
    Field(
        ge=-_MAX_MINUTES,
        le=_MAX_MINUTES,
        description="Minutes from the start of a range, else from the due time; negative is "
        "before. An all-day Task counts from the start of its day, so 540 is 09:00 on the day.",
    ),
]


class ReminderOut(Schema):
    """One of a Task's Reminders."""

    offset: ReminderOffset
    fire_at: datetime | None = Field(
        description="When it fires next; null when it won't: the Task is Closed or archived, or "
        "the time has passed.",
    )

    @classmethod
    def of(cls, reminder: Reminder) -> ReminderOut:
        """Return the Reminder as the API shows it, with its offset in whole minutes."""
        return cls(offset=int(reminder.offset.total_seconds()) // 60, fire_at=reminder.fire_at)


class RemindersChangedData(Schema):
    """The Reminders before and after a change, as offsets in minutes."""

    old: list[int]
    new: list[int]
    all_day: bool = Field(description="Whether the offsets count from the start of a day.")


class RemindersChangedActivityOut(Schema):
    """The Task's Reminders were added, changed or removed."""

    id: int
    kind: Literal["reminders_changed"]
    at: datetime
    data: RemindersChangedData
