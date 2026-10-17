"""Business rules for Habits: listing and adding them, and recording the user's Check-ins."""

from __future__ import annotations

from typing import TYPE_CHECKING

from django.db import transaction
from django.db.models import OuterRef, Subquery
from django.db.models.functions import Coalesce
from django.utils import timezone

from apps.accounts.models import User
from apps.accounts.services import local_zone
from apps.core.errors import DomainRuleError, NotFoundError
from apps.core.siblings import Siblings, by_key, row_lock
from apps.habits.models import CheckIn, Habit

if TYPE_CHECKING:
    from datetime import date

    from django.db.models import QuerySet

    from apps.core.palette import PaletteColor
    from apps.habits.models import HabitIcon

HABIT_NOT_FOUND = "Habit not found."


class HabitRuleError(DomainRuleError):
    """A change to a Habit or its Check-ins breaks one of the rules Habits follow."""


def today(user: User) -> date:
    """Return today's date on the user's clock."""
    return timezone.now().astimezone(local_zone(user)).date()


def habits(user: User) -> QuerySet[Habit]:
    """Return the user's Habits in their order, each with its `today_count` of Check-ins."""
    on_today = CheckIn.objects.filter(habit=OuterRef("pk"), date=today(user)).values("count")
    return user.habits.annotate(today_count=Coalesce(Subquery(on_today), 0))


def habit(user: User, habit_id: int) -> Habit:
    """Return the user's Habit with this id, with its `today_count`.

    Raises:
        NotFoundError: There's no such Habit.
    """
    found = habits(user).filter(pk=habit_id).first()
    if found is None:
        raise NotFoundError(HABIT_NOT_FOUND)
    return found


def habit_siblings(user: User) -> Siblings[int]:
    """Return the user's Habits, ordered by key and then id. Writes lock the user."""
    return by_key(row_lock(User.objects.filter(pk=user.pk)), user.habits.all())


def create_habit(
    user: User,
    name: str,
    *,
    icon: HabitIcon,
    color: PaletteColor,
    goal: int,
) -> Habit:
    """Add a daily Habit last in the user's order, starting today in the user's time zone."""
    with transaction.atomic():
        created = Habit.objects.create(
            owner=user,
            name=name,
            icon=icon,
            color=color,
            goal=goal,
            start_date=today(user),
            position=habit_siblings(user).last(),
        )
    return habit(user, created.pk)


def set_check_ins(user: User, habit_id: int, day: date, count: int) -> Habit:
    """Set how many times the user did a Habit on a day; zero clears the day.

    Raises:
        NotFoundError: There's no such Habit.
        HabitRuleError: The day is in the future or before the Habit started, or the count is
            above the Goal.
    """
    found = habit(user, habit_id)
    if day > today(user):
        msg = "You can't check in for a day that hasn't come yet."
        raise HabitRuleError(msg)
    if day < found.start_date:
        msg = "You can't check in for a day before the Habit started."
        raise HabitRuleError(msg)
    if count > found.goal:
        msg = f"A day can't have more Check-ins than the Goal of {found.goal}."
        raise HabitRuleError(msg)
    if count == 0:
        found.check_ins.filter(date=day).delete()
    else:
        CheckIn.objects.update_or_create(habit=found, date=day, defaults={"count": count})
    return habit(user, habit_id)
