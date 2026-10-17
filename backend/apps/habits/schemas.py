"""Request and response shapes for the Habit endpoints."""

from __future__ import annotations

from datetime import date  # noqa: TC003 - Pydantic needs the type at runtime
from typing import Annotated

from ninja import Field, Schema
from pydantic import StringConstraints

from apps.core.palette import PaletteColor  # noqa: TC001 - Pydantic needs the type at runtime
from apps.habits.models import Habit, HabitIcon  # noqa: TC001 - Pydantic needs the types at runtime

HabitName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]


class HabitOut(Schema):
    """A Habit's own fields."""

    id: int
    name: str
    icon: HabitIcon
    color: PaletteColor
    frequency: Habit.Frequency
    start_date: date = Field(description="The first day the Habit counts, in the user's zone.")


class HabitIn(Schema):
    """A new Habit. It's done every day, starting today."""

    name: HabitName
    icon: HabitIcon
    color: PaletteColor
