"""A Task's dates as one value: due date, time and range, all floating clock times."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from datetime import date, time

    from apps.tasks.models import Task


@dataclass(frozen=True)
class TaskDates:
    """A Task's due date, time and range, as clock times in the owner's zone; all None = undated."""

    due_date: date | None = None
    due_time: time | None = None
    start_date: date | None = None
    start_time: time | None = None

    @classmethod
    def of(cls, task: Task) -> TaskDates:
        """Return the Task's current dates."""
        return cls(task.due_date, task.due_time, task.start_date, task.start_time)

    def as_activity(self) -> dict[str, str | None] | None:
        """Return the dates as Activity stores them: ISO strings, or None when undated."""
        if self.due_date is None:
            return None
        return {
            "due_date": self.due_date.isoformat(),
            "due_time": None if self.due_time is None else self.due_time.isoformat("minutes"),
            "start_date": None if self.start_date is None else self.start_date.isoformat(),
            "start_time": None if self.start_time is None else self.start_time.isoformat("minutes"),
        }
