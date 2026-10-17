"""What the user can do from a Habit Reminder's Notification: check in today or snooze it.

A snooze is a one-off extra firing kept in `Habit.snoozed_until`, apart from the regular
`next_reminder_at`, so the sweep in `apps.habits.reminders` fires it without moving the Habit's
schedule.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from apps.core.errors import NotFoundError
from apps.habits import services
from apps.habits.schedule import today
from apps.notifications.services import mark_read
from apps.tasks.reminder_actions import snooze_end

if TYPE_CHECKING:
    from apps.accounts.models import User
    from apps.habits.models import Habit
    from apps.tasks.reminder_actions import Snooze

NOTIFICATION_NOT_FOUND = "Habit Reminder notification not found."


def _habit_id(user: User, notification_id: int) -> int:
    """Return the id of the Habit whose Reminder sent one of the user's notifications.

    Raises:
        NotFoundError: The notification isn't the user's, or no Habit Reminder sent it.
    """
    notification = user.notifications.filter(pk=notification_id, habit__isnull=False).first()
    if notification is None or notification.habit_id is None:
        raise NotFoundError(NOTIFICATION_NOT_FOUND)
    return notification.habit_id


def check_in(user: User, notification_id: int) -> Habit:
    """Add one Check-in today to the notification's Habit, never past its Goal.

    The notification counts as read, since the user has acted on it.

    Raises:
        NotFoundError: The notification isn't one of the user's Habit Reminder notifications.
        HabitRuleError: Today is before the Habit started.
    """
    habit = services.habit(user, _habit_id(user, notification_id))
    day = today(user)
    done = habit.check_ins.filter(date=day).values_list("count", flat=True).first() or 0
    checked_in = services.set_check_ins(user, habit.pk, day, min(done + 1, habit.goal))
    mark_read(user, notification_id)
    return checked_in


def snooze(user: User, notification_id: int, until: Snooze) -> None:
    """Fire the notification's Habit Reminder once more later, with the Task Reminder options.

    The notification counts as read, since the user has dealt with it for now.

    Raises:
        NotFoundError: The notification isn't one of the user's Habit Reminder notifications.
    """
    habit = services.habit(user, _habit_id(user, notification_id))
    habit.snoozed_until = snooze_end(user, until)
    habit.save(update_fields=["snoozed_until"])
    mark_read(user, notification_id)
