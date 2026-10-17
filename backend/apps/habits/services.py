"""Business rules for Habits: listing, adding, ordering, archiving and deleting Habits."""

from __future__ import annotations

from typing import TYPE_CHECKING

from django.db import transaction
from django.utils import timezone

from apps.accounts.models import User
from apps.accounts.services import local_zone
from apps.core.errors import NotFoundError
from apps.core.siblings import Siblings, by_key, row_lock
from apps.habits.models import Habit

if TYPE_CHECKING:
    from django.db.models import QuerySet

    from apps.core.palette import PaletteColor
    from apps.habits.models import HabitIcon


def habits(user: User) -> QuerySet[Habit]:
    """Return the user's Habits in their order."""
    return user.habits.all()


HABIT_NOT_FOUND = "Habit not found."


def habit(user: User, habit_id: int) -> Habit:
    """Return one of the user's Habits.

    Raises:
        NotFoundError: The Habit isn't one of the user's.
    """
    found = user.habits.filter(pk=habit_id).first()
    if found is None:
        raise NotFoundError(HABIT_NOT_FOUND)
    return found


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


def move_habit(user: User, habit_id: int, after_id: int | None) -> None:
    """Put one of the user's Habits right after another; first for None, last if it isn't theirs.

    Raises:
        NotFoundError: The Habit isn't one of the user's.
    """
    found = habit(user, habit_id)
    if after_id == found.pk:
        return
    with transaction.atomic():
        found.position = habit_siblings(user).after(after_id, moving=found.pk)
        found.save(update_fields=["position", "updated_at"])


def _set_archived(user: User, habit_id: int, *, archived: bool) -> Habit:
    found = habit(user, habit_id)
    if archived != found.is_archived:
        found.archived_at = timezone.now() if archived else None
        found.save(update_fields=["archived_at", "updated_at"])
    return found


def archive_habit(user: User, habit_id: int) -> Habit:
    """Archive one of the user's Habits, keeping its Check-ins and place. Twice is harmless.

    Raises:
        NotFoundError: The Habit isn't one of the user's.
    """
    return _set_archived(user, habit_id, archived=True)


def unarchive_habit(user: User, habit_id: int) -> Habit:
    """Bring one of the user's archived Habits back in its place, history intact.

    Raises:
        NotFoundError: The Habit isn't one of the user's.
    """
    return _set_archived(user, habit_id, archived=False)


def delete_habit(user: User, habit_id: int) -> None:
    """Delete one of the user's Habits for good, with its history.

    Raises:
        NotFoundError: The Habit isn't one of the user's.
    """
    habit(user, habit_id).delete()
