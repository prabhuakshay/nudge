"""Habit endpoints: list the user's Habits, add one and record Check-ins."""

from __future__ import annotations

from datetime import date  # noqa: TC003 - Ninja reads the path parameter's type at runtime
from http import HTTPStatus
from typing import TYPE_CHECKING

from ninja import Router, Status

from apps.core.auth import signed_in_user
from apps.core.schemas import ErrorOut
from apps.habits import services
from apps.habits.schemas import CheckInsIn, HabitIn, HabitOut

if TYPE_CHECKING:
    from django.http import HttpRequest

router = Router()


@router.get("", response={HTTPStatus.OK: list[HabitOut]}, summary="List Habits")
def list_habits(request: HttpRequest) -> Status[list[HabitOut]]:
    """Return the user's Habits in their order."""
    found = services.habits(signed_in_user(request))
    return Status(HTTPStatus.OK, [HabitOut.from_orm(habit) for habit in found])


@router.post("", response={HTTPStatus.CREATED: HabitOut}, summary="Add a Habit")
def create_habit(request: HttpRequest, habit: HabitIn) -> Status[HabitOut]:
    """Add a daily Habit last in the user's order, starting today in the user's time zone."""
    created = services.create_habit(
        signed_in_user(request),
        habit.name,
        icon=habit.icon,
        color=habit.color,
        goal=habit.goal,
    )
    return Status(HTTPStatus.CREATED, HabitOut.from_orm(created))


@router.put(
    "/{int:habit_id}/check-ins/{day}",
    response={
        HTTPStatus.OK: HabitOut,
        HTTPStatus.NOT_FOUND: ErrorOut,
        HTTPStatus.UNPROCESSABLE_ENTITY: ErrorOut,
    },
    summary="Set a day's Check-ins",
)
def set_check_ins(
    request: HttpRequest,
    habit_id: int,
    day: date,
    check_ins: CheckInsIn,
) -> Status[HabitOut]:
    """Set how many times the user did a Habit on a day, up to its Goal; zero clears the day."""
    updated = services.set_check_ins(signed_in_user(request), habit_id, day, check_ins.count)
    return Status(HTTPStatus.OK, HabitOut.from_orm(updated))
