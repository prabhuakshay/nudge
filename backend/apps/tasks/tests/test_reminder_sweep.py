"""Tests for the sweep that fires due Reminders as Notifications."""

from __future__ import annotations

import json
from datetime import UTC, date, datetime, time, timedelta
from typing import TYPE_CHECKING

import pytest

from apps.accounts.services import set_time_zone
from apps.notifications import services as notifications
from apps.notifications.models import Notification
from apps.tasks import creation, projects, reminder_actions, reminders, services
from apps.tasks.dates import TaskDates
from apps.tasks.models import Reminder, Task

if TYPE_CHECKING:
    from collections.abc import Callable

    from apps.accounts.models import User

# 13:00 in London (GMT in November).
NOW = datetime(2026, 11, 6, 13, 0, tzinfo=UTC)
THIRTY_MINUTES_BEFORE = timedelta(minutes=-30)


@pytest.fixture
def london(ada: User) -> User:
    return set_time_zone(ada, "Europe/London")


def _dated_task(
    user: User,
    due_date: date = date(2026, 11, 6),
    due_time: time | None = time(14, 0),
) -> Task:
    task = creation.create_task(services.inbox(user), "Call the bank")
    dates = TaskDates(due_date=due_date, due_time=due_time)
    services.update_task(user, task.pk, services.TaskEdit(dates=dates))
    return task


def _remind(user: User, task: Task, *offsets: timedelta) -> None:
    services.update_task(user, task.pk, services.TaskEdit(reminders=list(offsets)))


def _fire_at(task: Task) -> list[datetime | None]:
    return list(Reminder.objects.filter(task=task).values_list("fire_at", flat=True))


@pytest.mark.django_db
def test_due_reminders_fire_as_notifications(
    london: User,
    freeze_time: Callable[[datetime], None],
) -> None:
    freeze_time(NOW)
    work = projects.create_project(london, "Work")
    task = creation.create_task(work, "Send the report")
    dates = TaskDates(due_date=date(2026, 11, 6), due_time=time(14, 0))
    services.update_task(london, task.pk, services.TaskEdit(dates=dates))
    _remind(london, task, THIRTY_MINUTES_BEFORE)
    freeze_time(datetime(2026, 11, 6, 13, 30, 20, tzinfo=UTC))

    fired = reminders.send_due_reminders()

    notification = Notification.objects.get(user=london)
    reminder = Reminder.objects.get(task=task)
    assert fired == 1
    assert (notification.title, notification.body) == ("Send the report", "Today 14:00 · Work")
    assert notification.url == f"/projects/{work.pk}?task={task.pk}"
    assert reminder.sent_at == datetime(2026, 11, 6, 13, 30, 20, tzinfo=UTC)
    assert reminder.fire_at is None


@pytest.mark.django_db
def test_an_inbox_reminder_opens_the_task_in_the_inbox(
    london: User,
    freeze_time: Callable[[datetime], None],
) -> None:
    freeze_time(NOW)
    task = _dated_task(london, due_date=date(2026, 11, 7), due_time=None)
    _remind(london, task, timedelta(hours=-9))
    freeze_time(datetime(2026, 11, 6, 15, 0, tzinfo=UTC))

    reminders.send_due_reminders()

    notification = Notification.objects.get(user=london)
    assert (notification.body, notification.url) == ("Tomorrow · Inbox", f"/inbox?task={task.pk}")


@pytest.mark.django_db
def test_a_reminder_for_a_later_day_names_the_day(
    london: User,
    freeze_time: Callable[[datetime], None],
) -> None:
    freeze_time(datetime(2026, 11, 1, tzinfo=UTC))
    task = _dated_task(london, due_date=date(2026, 11, 13), due_time=time(9, 30))
    _remind(london, task, timedelta(days=-7))
    freeze_time(datetime(2026, 11, 6, 9, 30, tzinfo=UTC))

    reminders.send_due_reminders()

    assert Notification.objects.get(user=london).body == "Fri 13 Nov 09:30 · Inbox"


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("late", "fires"),
    [(timedelta(minutes=59), True), (timedelta(minutes=61), False)],
)
def test_after_an_outage_only_reminders_less_than_an_hour_late_fire(
    london: User,
    freeze_time: Callable[[datetime], None],
    late: timedelta,
    *,
    fires: bool,
) -> None:
    freeze_time(NOW)
    task = _dated_task(london)
    _remind(london, task, THIRTY_MINUTES_BEFORE)
    freeze_time(datetime(2026, 11, 6, 13, 30, tzinfo=UTC) + late)

    reminders.send_due_reminders()

    assert Notification.objects.filter(user=london).exists() is fires
    assert _fire_at(task) == [None]


@pytest.mark.django_db
def test_reminders_not_yet_due_wait(london: User, freeze_time: Callable[[datetime], None]) -> None:
    freeze_time(NOW)
    task = _dated_task(london)
    _remind(london, task, THIRTY_MINUTES_BEFORE)

    fired = reminders.send_due_reminders()

    assert fired == 0
    assert _fire_at(task) == [datetime(2026, 11, 6, 13, 30, tzinfo=UTC)]


@pytest.mark.django_db
def test_a_closed_task_never_fires_even_with_a_stale_fire_time(
    london: User,
    freeze_time: Callable[[datetime], None],
) -> None:
    freeze_time(NOW)
    task = _dated_task(london)
    _remind(london, task, THIRTY_MINUTES_BEFORE)
    # A Status change that skipped the services, so `fire_at` wasn't cleared.
    Task.objects.filter(pk=task.pk).update(status=Task.Status.COMPLETED, completed_at=NOW)
    freeze_time(datetime(2026, 11, 6, 13, 31, tzinfo=UTC))

    fired = reminders.send_due_reminders()

    assert fired == 0
    assert not Notification.objects.exists()


@pytest.mark.django_db
def test_a_reminder_push_offers_its_actions(
    london: User,
    freeze_time: Callable[[datetime], None],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sent: list[object] = []
    monkeypatch.setattr(
        notifications,
        "webpush",
        lambda **kwargs: sent.append(json.loads(str(kwargs["data"]))),
    )
    notifications.save_push_subscription(london, "https://push.example.com/phone", "key", "auth")
    freeze_time(NOW)
    _remind(london, _dated_task(london), THIRTY_MINUTES_BEFORE)
    freeze_time(datetime(2026, 11, 6, 13, 30, tzinfo=UTC))
    reminders.send_due_reminders()
    notification = Notification.objects.get(user=london)

    notifications.push_to_devices(notification.pk)

    assert sent == [
        {
            "id": notification.pk,
            "title": "Call the bank",
            "body": "Today 14:00 · Inbox",
            "url": notification.url,
            "is_reminder": True,
            "is_habit_reminder": False,
        },
    ]


@pytest.mark.django_db
def test_a_snooze_leaves_the_next_regular_firing_in_place(
    london: User,
    freeze_time: Callable[[datetime], None],
) -> None:
    freeze_time(NOW)
    task = _dated_task(london)
    _remind(london, task, THIRTY_MINUTES_BEFORE, timedelta(0))
    freeze_time(datetime(2026, 11, 6, 13, 30, tzinfo=UTC))
    reminders.send_due_reminders()
    first = Notification.objects.get(user=london)
    reminder_actions.snooze(london, first.pk, reminder_actions.Snooze.IN_15_MINUTES)
    freeze_time(datetime(2026, 11, 6, 13, 45, tzinfo=UTC))

    snoozed = reminders.send_due_reminders()
    freeze_time(datetime(2026, 11, 6, 14, 0, tzinfo=UTC))

    assert (snoozed, reminders.send_due_reminders()) == (1, 1)
