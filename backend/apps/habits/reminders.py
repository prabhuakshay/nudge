"""Habit Reminders: when each next fires, and the sweep that fires them.

A Habit stores its next fire time (`next_reminder_at`, UTC) so the sweep is one indexed query.
Every change that can move that time (reminder time, Frequency, Goal, start date, archiving,
Check-ins, the user's time zone) calls `reschedule`. The sweep, run by the every-minute Reminder
job, checks again that the day still needs the Habit before it fires, then moves on to the next
day that does. A snooze (`snoozed_until`) fires once more on top, unless the day's Goal or week
is met or the Habit is archived by then.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from typing import TYPE_CHECKING

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.accounts.services import local_zone
from apps.habits.models import Habit
from apps.habits.schedule import (
    DAYS_IN_WEEK,
    days_done,
    is_done,
    is_scheduled,
    is_week_met,
    week_of,
)
from apps.notifications.services import notify
from apps.tasks.reminders import CATCH_UP

if TYPE_CHECKING:
    from collections.abc import Iterable, Mapping

# A week always has a day that needs the Habit, so a week and a day of candidates are enough.
_LOOKAHEAD_DAYS = DAYS_IN_WEEK + 1


def reschedule(habits: Iterable[Habit]) -> None:
    """Work out again when each Habit's Reminder fires next, after a change it depends on.

    The search starts `CATCH_UP` ago rather than now, so a change made just after the reminder
    time, before the sweep got to it, keeps that Reminder, as the sweep would have sent it late.
    A Reminder already sent isn't found again.
    """
    catch_up_from = timezone.now() - CATCH_UP
    for habit in habits:
        sent = habit.last_reminded_at
        since = catch_up_from if sent is None else max(catch_up_from, sent)
        habit.next_reminder_at = next_reminder(habit, since)
        habit.save(update_fields=["next_reminder_at"])


def next_reminder(habit: Habit, after: datetime) -> datetime | None:
    """Return the first reminder time after `after` on a day that still needs the Habit.

    None when the Habit has no reminder time or is archived.
    """
    if habit.reminder_time is None or habit.is_archived:
        return None
    zone = local_zone(habit.owner)
    first = max(after.astimezone(zone).date(), habit.start_date)
    counts = _counts(habit, week_of(first))
    for offset in range(_LOOKAHEAD_DAYS):
        day = first + timedelta(days=offset)
        # Combining the naive clock time keeps it at 09:00 across daylight saving changes.
        at = datetime.combine(day, habit.reminder_time).replace(tzinfo=zone).astimezone(UTC)
        if at > after and _needs(habit, day, counts):
            return at
    return None


def _counts(habit: Habit, since: date) -> dict[date, int]:
    """Return the Habit's Check-ins by day from `since`; earlier ones can't stop a Reminder."""
    return dict(habit.check_ins.filter(date__gte=since).values_list("date", "count"))


def _needs(habit: Habit, day: date, counts: Mapping[date, int]) -> bool:
    """Whether the day asks for the Habit and neither its Goal nor its week is met yet."""
    return is_scheduled(habit, day) and _still_to_do(habit, day, counts)


def _still_to_do(habit: Habit, day: date, counts: Mapping[date, int]) -> bool:
    """Whether neither the day's Goal nor its week's number is met yet."""
    return not is_done(habit, counts.get(day, 0)) and not is_week_met(
        habit,
        days_done(habit, counts, week_of(day)),
    )


def send_due_reminders() -> int:
    """Fire every Habit Reminder or snooze that is due, as a Notification, and clear it.

    A fired Reminder moves on to its next day. Returns how many fired. Firings more than
    `CATCH_UP` late are dropped instead, catching up with the latest one, if any, that isn't.
    Rows are locked and skipped when already locked, so two sweeps running at once never send
    twice.
    """
    now = timezone.now()
    fired = 0
    with transaction.atomic():
        due = (
            Habit.objects.filter(Q(next_reminder_at__lte=now) | Q(snoozed_until__lte=now))
            .select_related("owner")
            .select_for_update(skip_locked=True, of=("self",))
        )
        for habit in due:
            if habit.next_reminder_at is not None and habit.next_reminder_at <= now - CATCH_UP:
                habit.next_reminder_at = next_reminder(habit, now - CATCH_UP)
            if _may_fire(habit, now):
                habit.last_reminded_at = habit.next_reminder_at
                _notify(habit)
                fired += 1
            elif _may_fire_snooze(habit, now):
                _notify(habit)
                fired += 1
            if habit.next_reminder_at is not None and habit.next_reminder_at <= now:
                habit.next_reminder_at = next_reminder(habit, now)
            if habit.snoozed_until is not None and habit.snoozed_until <= now:
                habit.snoozed_until = None
            habit.save(update_fields=["next_reminder_at", "last_reminded_at", "snoozed_until"])
    return fired


def _may_fire(habit: Habit, now: datetime) -> bool:
    """Whether the due time is recent and its day still needs the Habit, in case one slipped by."""
    due_at = habit.next_reminder_at
    if due_at is None or due_at > now or due_at <= now - CATCH_UP:
        return False
    return next_reminder(habit, due_at - timedelta(microseconds=1)) == due_at


def _may_fire_snooze(habit: Habit, now: datetime) -> bool:
    """Whether a snooze is due and recent, and the Habit is still live and to do that day."""
    due_at = habit.snoozed_until
    if due_at is None or due_at > now or due_at <= now - CATCH_UP or habit.is_archived:
        return False
    day = due_at.astimezone(local_zone(habit.owner)).date()
    return _still_to_do(habit, day, _counts(habit, week_of(day)))


def _notify(habit: Habit) -> None:
    notify(habit.owner, title=habit.name, url=f"/habits?habit={habit.pk}", habit=habit)
