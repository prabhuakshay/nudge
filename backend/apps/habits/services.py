"""Business rules for Habits: listing, adding and editing the user's Habits."""

from __future__ import annotations

from typing import TYPE_CHECKING

from django.db import transaction
from django.utils import timezone

from apps.accounts.models import User
from apps.accounts.services import local_zone
from apps.core.errors import DomainRuleError, NotFoundError
from apps.core.siblings import Siblings, by_key, row_lock
from apps.habits.models import Habit

if TYPE_CHECKING:
    from collections.abc import Iterable
    from datetime import date

    from django.db.models import QuerySet

    from apps.core.palette import PaletteColor
    from apps.habits.models import HabitIcon


def habits(user: User) -> QuerySet[Habit]:
    """Return the user's Habits in their order."""
    return user.habits.all()


def habit_siblings(user: User) -> Siblings[int]:
    """Return the user's Habits, ordered by key and then id. Writes lock the user."""
    return by_key(row_lock(User.objects.filter(pk=user.pk)), user.habits.all())


class HabitRuleError(DomainRuleError):
    """A Habit change the rules refuse, such as chosen weekdays with no weekday chosen."""


def create_habit(  # noqa: PLR0913 - one keyword per setting the user picks in the Add dialog
    user: User,
    name: str,
    *,
    icon: HabitIcon,
    color: PaletteColor,
    frequency: Habit.Frequency = Habit.Frequency.DAILY,
    weekdays: Iterable[int] = (),
    times_per_week: int | None = None,
    start_date: date | None = None,
) -> Habit:
    """Add a Habit last in the user's order, starting today in the user's time zone by default."""
    habit = Habit(
        owner=user,
        name=name,
        icon=icon,
        color=color,
        start_date=start_date or timezone.now().astimezone(local_zone(user)).date(),
    )
    _set_frequency(habit, frequency, weekdays, times_per_week)
    with transaction.atomic():
        habit.position = habit_siblings(user).last()
        habit.save()
    return habit


def habit(user: User, habit_id: int) -> Habit:
    """Return one of the user's Habits.

    Raises:
        NotFoundError: The Habit isn't one of the user's.
    """
    found = user.habits.filter(pk=habit_id).first()
    if found is None:
        message = "Habit not found."
        raise NotFoundError(message)
    return found


def update_habit(  # noqa: PLR0913 - one keyword per setting the user can change in the Edit dialog
    user: User,
    habit_id: int,
    *,
    name: str | None = None,
    icon: HabitIcon | None = None,
    color: PaletteColor | None = None,
    frequency: Habit.Frequency | None = None,
    weekdays: Iterable[int] | None = None,
    times_per_week: int | None = None,
    start_date: date | None = None,
) -> Habit:
    """Change any of a Habit's settings; None leaves a setting as it is.

    Raises:
        NotFoundError: The Habit isn't one of the user's.
        HabitRuleError: The new Frequency is missing its weekdays or times a week.
    """
    found = habit(user, habit_id)
    found.name = name if name is not None else found.name
    found.icon = icon if icon is not None else found.icon
    found.color = color if color is not None else found.color
    found.start_date = start_date if start_date is not None else found.start_date
    _set_frequency(
        found,
        frequency if frequency is not None else Habit.Frequency(found.frequency),
        weekdays if weekdays is not None else found.weekdays,
        times_per_week if times_per_week is not None else found.times_per_week,
    )
    found.save()
    return found


def _set_frequency(
    habit: Habit,
    frequency: Habit.Frequency,
    weekdays: Iterable[int],
    times_per_week: int | None,
) -> None:
    """Give the Habit a Frequency, keeping only the fields that Frequency uses."""
    chosen = sorted(set(weekdays)) if frequency == Habit.Frequency.WEEKDAYS else []
    if frequency == Habit.Frequency.WEEKDAYS and not chosen:
        message = "Choose at least one weekday."
        raise HabitRuleError(message)
    per_week = times_per_week if frequency == Habit.Frequency.TIMES_PER_WEEK else None
    if frequency == Habit.Frequency.TIMES_PER_WEEK and per_week is None:
        message = "Choose how many times a week."
        raise HabitRuleError(message)
    habit.frequency = frequency
    habit.weekdays = chosen
    habit.times_per_week = per_week
