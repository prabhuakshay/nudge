"""What the user can do from a fired Reminder's Notification: complete its Task or snooze it.

A snooze is a one-off extra firing of the Reminder, kept apart from its regular fire time, so it
never changes the Task and the sweep in `apps.tasks.reminders` fires it like any other.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from apps.core.errors import NotFoundError
from apps.notifications.reminders import snooze_end
from apps.notifications.services import mark_read
from apps.tasks import services
from apps.tasks.models import Task

if TYPE_CHECKING:
    from apps.accounts.models import User
    from apps.notifications.reminders import Snooze
    from apps.tasks.changes import TaskChange
    from apps.tasks.models import Reminder

NOTIFICATION_NOT_FOUND = "Reminder notification not found."


def _reminder(user: User, notification_id: int) -> Reminder:
    """Return the Reminder that sent one of the user's notifications.

    Raises:
        NotFoundError: The notification isn't the user's, or no Reminder sent it.
    """
    notification = (
        user.notifications.select_related("reminder")
        .filter(pk=notification_id, reminder__isnull=False)
        .first()
    )
    if notification is None or notification.reminder is None:
        raise NotFoundError(NOTIFICATION_NOT_FOUND)
    return notification.reminder


def snooze(user: User, notification_id: int, until: Snooze) -> None:
    """Fire the notification's Reminder once more later.

    The notification counts as read, since the user has dealt with it for now.

    Raises:
        NotFoundError: The notification isn't one of the user's Reminder notifications.
    """
    reminder = _reminder(user, notification_id)
    reminder.snoozed_until = snooze_end(user, until)
    reminder.save(update_fields=["snoozed_until"])
    mark_read(user, notification_id)


def complete(user: User, notification_id: int) -> TaskChange:
    """Complete the Task of the notification's Reminder, by the usual Status rules.

    The notification counts as read once the Task is complete.

    Raises:
        NotFoundError: The notification isn't one of the user's Reminder notifications, or its
            Task isn't live.
        ArchivedProjectError: The Task is in an archived Project.
        RepeatRuleError: The Task repeats and its Occurrence isn't due yet.
    """
    reminder = _reminder(user, notification_id)
    edit = services.TaskEdit(status=Task.Status.COMPLETED)
    change = services.update_task(user, reminder.task_id, edit)
    mark_read(user, notification_id)
    return change
