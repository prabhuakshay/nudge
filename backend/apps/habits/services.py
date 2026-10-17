"""Business rules for Habits: listing the user's Habits and adding new ones last in their order."""

from __future__ import annotations

from typing import TYPE_CHECKING

from django.db import transaction
from django.utils import timezone

from apps.accounts.models import User
from apps.accounts.services import local_zone
from apps.core.siblings import Siblings, by_key, row_lock
from apps.habits.models import Habit

if TYPE_CHECKING:
    from django.db.models import QuerySet

    from apps.core.palette import PaletteColor
    from apps.habits.models import HabitIcon


def habits(user: User) -> QuerySet[Habit]:
    """Return the user's Habits in their order."""
    return user.habits.all()


def habit_siblings(user: User) -> Siblings[int]:
    """Return the user's Habits, ordered by key and then id. Writes lock the user."""
    return by_key(row_lock(User.objects.filter(pk=user.pk)), user.habits.all())


def create_habit(user: User, name: str, *, icon: HabitIcon, color: PaletteColor) -> Habit:
    """Add a daily Habit last in the user's order, starting today in the user's time zone."""
    today = timezone.now().astimezone(local_zone(user)).date()
    with transaction.atomic():
        return Habit.objects.create(
            owner=user,
            name=name,
            icon=icon,
            color=color,
            start_date=today,
            position=habit_siblings(user).last(),
        )
