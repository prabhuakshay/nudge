"""Business rules for Habits: adding, editing, ordering, archiving, deleting, Check-ins."""

from __future__ import annotations

from collections import Counter
from typing import TYPE_CHECKING

from django.db import transaction
from django.db.models import F, OuterRef, Subquery
from django.db.models.functions import Coalesce
from django.utils import timezone

from apps.accounts.models import User
from apps.core.errors import DomainRuleError, NotFoundError
from apps.core.siblings import Siblings, by_key, row_lock
from apps.habits.models import CheckIn, Habit
from apps.habits.schedule import is_scheduled, is_week_met, today, week_of

if TYPE_CHECKING:
    from collections.abc import Iterable
    from datetime import date

    from django.db.models import QuerySet

    from apps.core.palette import PaletteColor
    from apps.habits.models import HabitIcon

HABIT_NOT_FOUND = "Habit not found."


class HabitRuleError(DomainRuleError):
    """A change to a Habit or its Check-ins breaks one of the rules Habits follow."""


def habits(user: User) -> QuerySet[Habit]:
    """Return the user's Habits in their order, each with its `today_count` of Check-ins.

    The owner and Check-ins come along, since every Habit's Streak is derived from them.
    """
    on_today = CheckIn.objects.filter(habit=OuterRef("pk"), date=today(user)).values("count")
    return (
        user.habits.annotate(today_count=Coalesce(Subquery(on_today), 0))
        .select_related("owner")
        .prefetch_related("check_ins")
    )


def habit(user: User, habit_id: int) -> Habit:
    """Return the user's Habit with this id, with its `today_count`.

    Raises:
        NotFoundError: There's no such Habit.
    """
    found = habits(user).filter(pk=habit_id).first()
    if found is None:
        raise NotFoundError(HABIT_NOT_FOUND)
    return found


def today_strip(user: User) -> list[Habit]:
    """Return the user's live Habits for the Today strip, in their order.

    A Habit belongs there when it's scheduled today or, for one done a number of times a week,
    when the days before today haven't met its week yet. One done today stays, so the strip
    doesn't lose a Habit the moment it's checked in.
    """
    day = today(user)
    monday = week_of(day)
    done_days = Counter(
        CheckIn.objects.filter(
            habit__owner=user,
            date__gte=monday,
            date__lt=day,
            count__gte=F("habit__goal"),
        ).values_list("habit_id", flat=True)
    )
    return [
        found
        for found in habits(user).filter(archived_at=None)
        if is_scheduled(found, day) and not is_week_met(found, done_days[found.pk])
    ]


def habit_siblings(user: User) -> Siblings[int]:
    """Return the user's Habits, ordered by key and then id. Writes lock the user."""
    return by_key(row_lock(User.objects.filter(pk=user.pk)), user.habits.all())


def create_habit(  # noqa: PLR0913 - one keyword per setting the user picks in the Add dialog
    user: User,
    name: str,
    *,
    icon: HabitIcon,
    color: PaletteColor,
    frequency: Habit.Frequency = Habit.Frequency.DAILY,
    weekdays: Iterable[int] = (),
    times_per_week: int | None = None,
    goal: int = 1,
    start_date: date | None = None,
) -> Habit:
    """Add a Habit last in the user's order, starting today in the user's time zone by default."""
    created = Habit(
        owner=user,
        name=name,
        icon=icon,
        color=color,
        goal=goal,
        start_date=start_date or today(user),
    )
    _set_frequency(created, frequency, weekdays, times_per_week)
    with transaction.atomic():
        created.position = habit_siblings(user).last()
        created.save()
    return habit(user, created.pk)


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
    goal: int | None = None,
    start_date: date | None = None,
) -> Habit:
    """Change any of a Habit's settings; None leaves a setting as it is.

    A lower Goal lowers any day's Check-ins above it, so no day has more than the Goal.

    Raises:
        NotFoundError: The Habit isn't one of the user's.
        HabitRuleError: The new Frequency is missing its weekdays or times a week.
    """
    found = habit(user, habit_id)
    found.name = name if name is not None else found.name
    found.icon = icon if icon is not None else found.icon
    found.color = color if color is not None else found.color
    found.goal = goal if goal is not None else found.goal
    found.start_date = start_date if start_date is not None else found.start_date
    _set_frequency(
        found,
        frequency if frequency is not None else Habit.Frequency(found.frequency),
        weekdays if weekdays is not None else found.weekdays,
        times_per_week if times_per_week is not None else found.times_per_week,
    )
    with transaction.atomic():
        found.save()
        found.check_ins.filter(count__gt=found.goal).update(count=found.goal)
    return habit(user, habit_id)


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


def check_ins(user: User, habit_id: int, first: date, last: date) -> QuerySet[CheckIn]:
    """Return a Habit's Check-ins from the first day to the last, both included, oldest first.

    Raises:
        NotFoundError: There's no such Habit.
    """
    return habit(user, habit_id).check_ins.filter(date__range=(first, last))


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
