"""Request and response shapes for the Habit endpoints."""

from __future__ import annotations

from datetime import date  # noqa: TC003 - Pydantic needs the type at runtime
from typing import Annotated

from ninja import Field, Schema
from pydantic import StringConstraints

from apps.core.palette import PaletteColor  # noqa: TC001 - Pydantic needs the type at runtime
from apps.habits.models import MAX_GOAL, Habit, HabitIcon

HabitName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]


class HabitOut(Schema):
    """A Habit's own fields."""

    id: int
    name: str
    icon: HabitIcon
    color: PaletteColor
    frequency: Habit.Frequency
    goal: int = Field(description="How many Check-ins make a day done.")
    start_date: date = Field(description="The first day the Habit counts, in the user's zone.")
    today_count: int = Field(description="Check-ins so far today, in the user's zone.")
    is_archived: bool = Field(
        description="Archived Habits keep their history but stay out of Today."
    )


class HabitMoveIn(Schema):
    """Where a Habit goes in the user's order."""

    after_id: int | None = Field(
        default=None,
        description="The Habit it now follows; first when null, last when it isn't there.",
    )


class HabitIn(Schema):
    """A new Habit. It's done every day, starting today."""

    name: HabitName
    icon: HabitIcon
    color: PaletteColor
    goal: int = Field(default=1, ge=1, le=MAX_GOAL)


class CheckInsIn(Schema):
    """How many times the user did a Habit on a day. Zero clears the day."""

    count: int = Field(ge=0)
