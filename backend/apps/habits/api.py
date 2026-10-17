"""Habit endpoints: list all or today's Habits, add, edit, order, archive, delete, Check-ins.

Also the actions on a Habit Reminder's notification: check in and snooze.
"""

from __future__ import annotations

from datetime import date  # noqa: TC003 - Ninja reads the path parameter's type at runtime
from http import HTTPStatus
from typing import TYPE_CHECKING

from ninja import Router, Status

from apps.core.auth import signed_in_user
from apps.core.schemas import ErrorOut
from apps.habits import reminder_actions, services
from apps.habits.schemas import (
    CheckInOut,
    CheckInsIn,
    HabitIn,
    HabitMoveIn,
    HabitOut,
    HabitPatchIn,
)
from apps.tasks.schemas.reminders import SnoozeIn  # noqa: TC001 - Ninja reads the type at runtime

if TYPE_CHECKING:
    from django.http import HttpRequest

router = Router()
# Mounted under /notifications, beside the Task Reminder actions.
reminder_actions_router = Router()


@router.get("", response={HTTPStatus.OK: list[HabitOut]}, summary="List Habits")
def list_habits(request: HttpRequest) -> Status[list[HabitOut]]:
    """Return the user's Habits in their order."""
    found = services.habits(signed_in_user(request))
    return Status(HTTPStatus.OK, [HabitOut.from_orm(habit) for habit in found])


@router.get("/today", response={HTTPStatus.OK: list[HabitOut]}, summary="List today's Habits")
def list_today_habits(request: HttpRequest) -> Status[list[HabitOut]]:
    """Return the Habits for the Today strip: due today, or still short of this week's target."""
    found = services.today_strip(signed_in_user(request))
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
        goal=habit.goal,
        start_date=habit.start_date,
        reminder_time=habit.reminder_time,
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
    """Change any of a Habit's settings; the ones left out stay as they are.

    A null reminder time removes the Reminder, unlike the other settings.
    """
    updated = services.update_habit(
        signed_in_user(request),
        habit_id,
        name=patch.name,
        icon=patch.icon,
        color=patch.color,
        frequency=patch.frequency,
        weekdays=patch.weekdays,
        times_per_week=patch.times_per_week,
        goal=patch.goal,
        start_date=patch.start_date,
        reminder_time=patch.reminder_time,
        remove_reminder="reminder_time" in patch.model_fields_set and patch.reminder_time is None,
    )
    return Status(HTTPStatus.OK, HabitOut.from_orm(updated))


@router.get(
    "/{int:habit_id}/check-ins",
    response={HTTPStatus.OK: list[CheckInOut], HTTPStatus.NOT_FOUND: ErrorOut},
    summary="List a Habit's Check-ins",
)
def list_check_ins(
    request: HttpRequest,
    habit_id: int,
    start: date,
    end: date,
) -> Status[list[CheckInOut]]:
    """Return the days from `start` to `end`, both included, that have Check-ins, oldest first."""
    found = services.check_ins(signed_in_user(request), habit_id, start, end)
    return Status(HTTPStatus.OK, [CheckInOut.from_orm(check_in) for check_in in found])


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


@reminder_actions_router.post(
    "/{int:notification_id}/check-in",
    response={
        HTTPStatus.OK: HabitOut,
        HTTPStatus.NOT_FOUND: ErrorOut,
        HTTPStatus.UNPROCESSABLE_ENTITY: ErrorOut,
    },
    summary="Check in to a Habit from its Reminder",
)
def check_in_from_reminder(request: HttpRequest, notification_id: int) -> Status[HabitOut]:
    """Add one Check-in today to the Habit a Reminder notification is about, up to its Goal."""
    habit = reminder_actions.check_in(signed_in_user(request), notification_id)
    return Status(HTTPStatus.OK, HabitOut.from_orm(habit))


@reminder_actions_router.post(
    "/{int:notification_id}/snooze-habit",
    response={HTTPStatus.NO_CONTENT: None, HTTPStatus.NOT_FOUND: ErrorOut},
    summary="Snooze a Habit Reminder",
)
def snooze_from_reminder(
    request: HttpRequest,
    notification_id: int,
    body: SnoozeIn,
) -> Status[None]:
    """Fire a Habit Reminder notification once more later, leaving the Habit's schedule as it is."""
    reminder_actions.snooze(signed_in_user(request), notification_id, body.until)
    return Status(HTTPStatus.NO_CONTENT, None)
