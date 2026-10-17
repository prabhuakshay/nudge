"""Request and response shapes for the Habit endpoints."""

from __future__ import annotations

from datetime import date  # noqa: TC003 - Pydantic needs the type at runtime
from typing import Annotated

from ninja import Field, Schema
from pydantic import StringConstraints

from apps.core.palette import PaletteColor  # noqa: TC001 - Pydantic needs the type at runtime
from apps.habits.models import MAX_GOAL, Habit, HabitIcon

HabitName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
Goal = Annotated[int, Field(ge=1, le=MAX_GOAL)]
IsoWeekday = Annotated[int, Field(ge=1, le=7, description="1 is Monday, 7 is Sunday.")]
TimesPerWeek = Annotated[int, Field(ge=1, le=6)]


class HabitOut(Schema):
    """A Habit's own fields."""

    id: int
    name: str
    icon: HabitIcon
    color: PaletteColor
    frequency: Habit.Frequency
    weekdays: list[int] = Field(description="The chosen weekdays, 1 is Monday; else empty.")
    times_per_week: int | None = Field(description="How many times a week; else null.")
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
    """A new Habit. Unless told otherwise it's done once every day, starting today."""

    name: HabitName
    icon: HabitIcon
    color: PaletteColor
    frequency: Habit.Frequency = Habit.Frequency.DAILY
    weekdays: list[IsoWeekday] = Field(
        default_factory=list,
        description="The chosen weekdays, needed when the Frequency is chosen weekdays.",
    )
    times_per_week: TimesPerWeek | None = Field(
        default=None,
        description="How many times a week, needed when the Frequency is times a week.",
    )
    goal: Goal = 1
    start_date: date | None = Field(default=None, description="Defaults to today.")


class HabitPatchIn(Schema):
    """The settings of a Habit to change; settings left out or null stay as they are."""

    name: HabitName | None = None
    icon: HabitIcon | None = None
    color: PaletteColor | None = None
    frequency: Habit.Frequency | None = None
    weekdays: list[IsoWeekday] | None = Field(
        default=None,
        description="The chosen weekdays, kept only when the Frequency is chosen weekdays.",
    )
    times_per_week: TimesPerWeek | None = Field(
        default=None,
        description="How many times a week, kept only when the Frequency is times a week.",
    )
    goal: Goal | None = Field(
        default=None,
        description="A lower Goal lowers any day's Check-ins above it to the new Goal.",
    )
    start_date: date | None = None


class CheckInsIn(Schema):
    """How many times the user did a Habit on a day. Zero clears the day."""

    count: int = Field(ge=0)
