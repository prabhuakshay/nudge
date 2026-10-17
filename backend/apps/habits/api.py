"""Habit endpoints: list, add, move, archive, unarchive and delete Habits, and set Check-ins."""

from __future__ import annotations

from datetime import date  # noqa: TC003 - Ninja reads the path parameter's type at runtime
from http import HTTPStatus
from typing import TYPE_CHECKING

from ninja import Router, Status

from apps.core.auth import signed_in_user
from apps.core.schemas import ErrorOut
from apps.habits import services
from apps.habits.schemas import CheckInsIn, HabitIn, HabitMoveIn, HabitOut

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


@router.post(
    "/{int:habit_id}/move",
    response={HTTPStatus.NO_CONTENT: None, HTTPStatus.NOT_FOUND: ErrorOut},
    summary="Move a Habit in the user's order",
)
def move_habit(request: HttpRequest, habit_id: int, move: HabitMoveIn) -> Status[None]:
    """Put a Habit right after another, or first."""
    services.move_habit(signed_in_user(request), habit_id, move.after_id)
    return Status(HTTPStatus.NO_CONTENT, None)


@router.post(
    "/{int:habit_id}/archive",
    response={HTTPStatus.OK: HabitOut, HTTPStatus.NOT_FOUND: ErrorOut},
    summary="Archive a Habit",
)
def archive_habit(request: HttpRequest, habit_id: int) -> Status[HabitOut]:
    """Move a Habit to the Archived section, keeping its Check-ins."""
    archived = services.archive_habit(signed_in_user(request), habit_id)
    return Status(HTTPStatus.OK, HabitOut.from_orm(archived))


@router.post(
    "/{int:habit_id}/unarchive",
    response={HTTPStatus.OK: HabitOut, HTTPStatus.NOT_FOUND: ErrorOut},
    summary="Unarchive a Habit",
)
def unarchive_habit(request: HttpRequest, habit_id: int) -> Status[HabitOut]:
    """Bring an archived Habit back to its place, with its Check-ins."""
    unarchived = services.unarchive_habit(signed_in_user(request), habit_id)
    return Status(HTTPStatus.OK, HabitOut.from_orm(unarchived))


@router.delete(
    "/{int:habit_id}",
    response={HTTPStatus.NO_CONTENT: None, HTTPStatus.NOT_FOUND: ErrorOut},
    summary="Delete a Habit",
)
def delete_habit(request: HttpRequest, habit_id: int) -> Status[None]:
    """Delete a Habit and its Check-ins for good. Habits don't go to Trash."""
    services.delete_habit(signed_in_user(request), habit_id)
    return Status(HTTPStatus.NO_CONTENT, None)
