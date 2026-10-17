"""Request and response shapes for the Habit endpoints."""

from __future__ import annotations

from datetime import date  # noqa: TC003 - Pydantic needs the type at runtime
from typing import Annotated

from ninja import Field, Schema
from pydantic import StringConstraints

from apps.core.palette import PaletteColor  # noqa: TC001 - Pydantic needs the type at runtime
from apps.habits.models import Habit, HabitIcon

HabitName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
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
    start_date: date = Field(description="The first day the Habit counts, in the user's zone.")


class HabitIn(Schema):
    """A new Habit. Unless told otherwise it's done every day, starting today."""

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
    start_date: date | None = None
