"""Habit endpoints: list the user's Habits and add one."""

from __future__ import annotations

from http import HTTPStatus
from typing import TYPE_CHECKING

from ninja import Router, Status

from apps.core.auth import signed_in_user
from apps.habits import services
from apps.habits.schemas import HabitIn, HabitOut

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
    )
    return Status(HTTPStatus.CREATED, HabitOut.from_orm(created))
