"""Reminders: setting them on a Task, working out when each fires, and the sweep that fires them.

A Reminder stores its next fire time (`fire_at`, UTC) so the sweep is one indexed query. Anything
that moves that time, such as new dates, a Status change, archiving or a new time zone, calls
`reschedule`; `apps.tasks.signals` does so for saves of Tasks, Projects and users. The sweep
checks again that a Task may fire, so a Closed or archived Task stays quiet even if a change
slipped past `reschedule`.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.accounts.services import local_zone
from apps.core.errors import DomainRuleError
from apps.notifications.services import notify
from apps.tasks.dates import TaskDates
from apps.tasks.models import OPEN_STATUSES, Reminder, Task, TaskActivity

if TYPE_CHECKING:
    from django.db.models import QuerySet

MAX_REMINDERS = 10
MAX_OFFSET = timedelta(days=365)
# A Reminder this late (the worker was down) is dropped, so an outage doesn't end in a flood.
CATCH_UP = timedelta(hours=1)


class ReminderRuleError(DomainRuleError):
    """A set of Reminders that would break a Reminder rule. The message says which."""


def replace(task: Task, offsets: list[timedelta] | None, dates_before: TaskDates) -> None:
    """Give the Task exactly these Reminders, and log the change in its Activity.

    With `offsets` None the Reminders stay, unless the Task has just lost its due date: then
    they go, since they count from it. Call it inside the transaction that saved the Task.

    Raises:
        ReminderRuleError: The offsets break a Reminder rule.
    """
    if offsets is None and task.due_date is not None:
        return
    current = list(task.reminders.values_list("offset", flat=True))
    wanted = [] if offsets is None else offsets
    _check(task, wanted)
    if sorted(wanted) == sorted(current):
        return
    task.reminders.exclude(offset__in=wanted).delete()
    Reminder.objects.bulk_create(
        Reminder(task=task, offset=offset, fire_at=_upcoming(_fire_time(task, offset)))
        for offset in set(wanted) - set(current)
    )
    dates = TaskDates.of(task) if task.due_date is not None else dates_before
    TaskActivity.objects.create(
        task=task,
        kind=TaskActivity.Kind.REMINDERS_CHANGED,
        data={"old": _minutes(current), "new": _minutes(wanted), "all_day": dates.due_time is None},
    )


def _check(task: Task, offsets: list[timedelta]) -> None:
    if offsets and task.due_date is None:
        message = "A reminder needs a due date."
        raise ReminderRuleError(message)
    if len(offsets) > MAX_REMINDERS:
        message = f"A task can have at most {MAX_REMINDERS} reminders."
        raise ReminderRuleError(message)
    if len(set(offsets)) != len(offsets):
        message = "The same reminder can't be set twice."
        raise ReminderRuleError(message)
    if any(abs(offset) > MAX_OFFSET for offset in offsets):
        message = f"Reminders must be within {MAX_OFFSET.days} days of the task."
        raise ReminderRuleError(message)


def _minutes(offsets: list[timedelta]) -> list[int]:
    return sorted(int(offset.total_seconds()) // 60 for offset in offsets)


def reschedule(tasks: QuerySet[Task]) -> None:
    """Work out again when each Reminder of the Tasks fires, after something it depends on changed.

    A Reminder whose time is unchanged keeps it, so one that is due but not yet swept still fires.
    """
    changed = []
    for reminder in Reminder.objects.filter(task__in=tasks).select_related(
        "task__project",
        "task__owner",
    ):
        fire_at = _fire_time(reminder.task, reminder.offset)
        if fire_at != reminder.fire_at:
            reminder.fire_at = _upcoming(fire_at)
            changed.append(reminder)
    Reminder.objects.bulk_update(changed, ["fire_at"])


def _fire_time(task: Task, offset: timedelta) -> datetime | None:
    """Return when a Reminder with the offset fires, or None if the Task's Reminders don't fire.

    The offset moves the clock time, not the instant, so "09:00 the day before" stays 09:00 even
    when daylight saving changes in between.
    """
    anchor = TaskDates.of(task).anchor()
    if anchor is None or not _may_fire(task):
        return None
    return (anchor + offset).replace(tzinfo=local_zone(task.owner)).astimezone(UTC)


def _upcoming(fire_at: datetime | None) -> datetime | None:
    """Return the fire time if it is still ahead; a time that has passed never fires."""
    return fire_at if fire_at is not None and fire_at > timezone.now() else None


def _may_fire(task: Task) -> bool:
    """Whether the Task is open work the user can see: not Closed, in Trash or archived."""
    project = task.project
    return (
        task.status in OPEN_STATUSES
        and task.deleted_at is None
        and project.deleted_at is None
        and project.archived_at is None
    )


def send_due_reminders() -> int:
    """Fire every Reminder that is due or whose snooze is over, as a Notification.

    Returns how many fired. Firings more than `CATCH_UP` late are dropped instead. Rows are
    locked and skipped when already locked, so two sweeps running at once never send twice.
    """
    now = timezone.now()
    fired = 0
    with transaction.atomic():
        Reminder.objects.filter(fire_at__lte=now - CATCH_UP).update(fire_at=None)
        Reminder.objects.filter(snoozed_until__lte=now - CATCH_UP).update(snoozed_until=None)
        due = (
            Reminder.objects.filter(Q(fire_at__lte=now) | Q(snoozed_until__lte=now))
            .select_related("task__project", "task__owner")
            .select_for_update(skip_locked=True, of=("self",))
        )
        for reminder in due:
            if _may_fire(reminder.task):
                _notify(reminder, now)
                reminder.sent_at = now
                fired += 1
            reminder.fire_at = _unless_due(reminder.fire_at, now)
            reminder.snoozed_until = _unless_due(reminder.snoozed_until, now)
            reminder.save(update_fields=["fire_at", "snoozed_until", "sent_at"])
    return fired


def _unless_due(at: datetime | None, now: datetime) -> datetime | None:
    """Return a fire time that is still ahead; one that is due is used up by this firing."""
    return at if at is not None and at > now else None


def _notify(reminder: Reminder, now: datetime) -> None:
    task = reminder.task
    project = task.project
    path = "/inbox" if project.is_inbox else f"/projects/{project.pk}"
    body = f"{_when(task, now)} · {project.name}"
    notify(task.owner, title=task.title, body=body, url=f"{path}?task={task.pk}", reminder=reminder)


def _when(task: Task, now: datetime) -> str:
    """Return when the Task starts or is due, as the user reads it: "Today 14:00", "Fri 13 Nov"."""
    anchor = TaskDates.of(task).anchor()
    assert anchor is not None  # noqa: S101 - only a dated Task has Reminders
    days = (anchor.date() - now.astimezone(local_zone(task.owner)).date()).days
    names = {-1: "Yesterday", 0: "Today", 1: "Tomorrow"}
    day = names.get(days) or f"{anchor:%a} {anchor.day} {anchor:%b}"
    timed = (task.start_time if task.start_date else task.due_time) is not None
    return f"{day} {anchor:%H:%M}" if timed else day
