"""Habit endpoints: list the user's Habits, add one and edit one."""

from __future__ import annotations

from http import HTTPStatus
from typing import TYPE_CHECKING

from ninja import Router, Status

from apps.core.auth import signed_in_user
from apps.core.schemas import ErrorOut
from apps.habits import services
from apps.habits.schemas import HabitIn, HabitOut, HabitPatchIn

if TYPE_CHECKING:
    from django.http import HttpRequest

router = Router()


@router.get("", response={HTTPStatus.OK: list[HabitOut]}, summary="List Habits")
def list_habits(request: HttpRequest) -> Status[list[HabitOut]]:
    """Return the user's Habits in their order."""
    found = services.habits(signed_in_user(request))
    return Status(HTTPStatus.OK, [HabitOut.from_orm(habit) for habit in found])


@router.post(
    "",
    response={HTTPStatus.CREATED: HabitOut, HTTPStatus.UNPROCESSABLE_ENTITY: ErrorOut},
    summary="Add a Habit",
)
def create_habit(request: HttpRequest, habit: HabitIn) -> Status[HabitOut]:
    """Add a Habit last in the user's order, starting today in the user's time zone by default."""
    created = services.create_habit(
        signed_in_user(request),
        habit.name,
        icon=habit.icon,
        color=habit.color,
        frequency=habit.frequency,
        weekdays=habit.weekdays,
        times_per_week=habit.times_per_week,
        start_date=habit.start_date,
    )
    return Status(HTTPStatus.CREATED, HabitOut.from_orm(created))


@router.patch(
    "/{int:habit_id}",
    response={
        HTTPStatus.OK: HabitOut,
        HTTPStatus.NOT_FOUND: ErrorOut,
        HTTPStatus.UNPROCESSABLE_ENTITY: ErrorOut,
    },
    summary="Edit a Habit",
)
def update_habit(request: HttpRequest, habit_id: int, patch: HabitPatchIn) -> Status[HabitOut]:
    """Change any of a Habit's settings; the ones left out stay as they are."""
    updated = services.update_habit(
        signed_in_user(request),
        habit_id,
        name=patch.name,
        icon=patch.icon,
        color=patch.color,
        frequency=patch.frequency,
        weekdays=patch.weekdays,
        times_per_week=patch.times_per_week,
        start_date=patch.start_date,
    )
    return Status(HTTPStatus.OK, HabitOut.from_orm(updated))
