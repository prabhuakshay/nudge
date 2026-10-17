"""Tests for checking in to and snoozing a Habit from its Reminder's Notification."""

from __future__ import annotations

from datetime import UTC, date, datetime, time
from typing import TYPE_CHECKING

import pytest
from django.test import Client

from apps.accounts.services import set_time_zone
from apps.core.palette import PaletteColor
from apps.habits import services
from apps.habits.models import Habit, HabitIcon
from apps.notifications.models import Notification
from apps.notifications.services import notify
from apps.tasks import tasks as jobs

if TYPE_CHECKING:
    from collections.abc import Callable

    from django.test.client import _MonkeyPatchedWSGIResponse as Response

    from apps.accounts.models import User

# Tuesday 10 March 2026, 09:00 in London (GMT until 29 March), when the Reminder fires.
FIRED = datetime(2026, 3, 10, 9, 0, tzinfo=UTC)


@pytest.fixture
def client(ada: User, freeze_time: Callable[[datetime], None]) -> Client:
    # Stop the clock before signing in, or the session would have expired by then.
    freeze_time(FIRED)
    client = Client()
    client.force_login(ada)
    return client


def _fired_reminder(
    user: User,
    freeze_time: Callable[[datetime], None],
    goal: int = 1,
) -> Notification:
    """Give the user a Habit reminding at 09:00 and fire its Reminder."""
    set_time_zone(user, "Europe/London")
    freeze_time(datetime(2026, 3, 10, 8, 0, tzinfo=UTC))
    services.create_habit(
        user,
        "Drink water",
        icon=HabitIcon.DROPLET,
        color=PaletteColor.BLUE,
        goal=goal,
        start_date=date(2026, 3, 1),
        reminder_time=time(9, 0),
    )
    freeze_time(FIRED)
    jobs.send_due_reminders(timestamp=0)
    return Notification.objects.get(user=user)


def _habit(notification: Notification) -> Habit:
    assert notification.habit is not None
    return notification.habit


def _check_in(client: Client, notification: Notification) -> Response:
    return client.post(f"/api/v1/notifications/{notification.pk}/check-in")


def _snooze(client: Client, notification: Notification, until: str) -> Response:
    return client.post(
        f"/api/v1/notifications/{notification.pk}/snooze-habit",
        {"until": until},
        content_type="application/json",
    )


def _sweep_at(freeze_time: Callable[[datetime], None], instant: datetime) -> int:
    """Run the Reminder sweep at `instant`; return how many Habit Reminder notifications exist."""
    freeze_time(instant)
    jobs.send_due_reminders(timestamp=0)
    return Notification.objects.filter(habit__isnull=False).count()


@pytest.mark.parametrize(
    "path",
    ["/api/v1/notifications/1/check-in", "/api/v1/notifications/1/snooze-habit"],
)
@pytest.mark.django_db
def test_every_endpoint_requires_a_session(path: str) -> None:
    response = Client().post(path, {"until": "in_15_minutes"}, content_type="application/json")

    assert response.status_code == 401


@pytest.mark.django_db
def test_a_habit_reminder_notification_offers_its_actions(
    client: Client,
    ada: User,
    freeze_time: Callable[[datetime], None],
) -> None:
    _fired_reminder(ada, freeze_time)

    items = client.get("/api/v1/notifications").json()["items"]

    assert [(i["title"], i["is_reminder"], i["is_habit_reminder"]) for i in items] == [
        ("Drink water", False, True),
    ]


@pytest.mark.django_db
def test_check_in_adds_one_today_and_marks_the_notification_read(
    client: Client,
    ada: User,
    freeze_time: Callable[[datetime], None],
) -> None:
    notification = _fired_reminder(ada, freeze_time, goal=3)

    response = _check_in(client, notification)

    assert response.status_code == 200
    assert (response.json()["name"], response.json()["today_count"]) == ("Drink water", 1)
    notification.refresh_from_db()
    assert notification.read_at == FIRED


@pytest.mark.django_db
def test_check_in_stops_at_the_goal(
    client: Client,
    ada: User,
    freeze_time: Callable[[datetime], None],
) -> None:
    notification = _fired_reminder(ada, freeze_time, goal=2)

    counts = [_check_in(client, notification).json()["today_count"] for _ in range(3)]

    assert counts == [1, 2, 2]


@pytest.mark.django_db
def test_check_in_keeps_a_count_above_a_lowered_goal(
    client: Client,
    ada: User,
    freeze_time: Callable[[datetime], None],
) -> None:
    notification = _fired_reminder(ada, freeze_time, goal=3)
    habit = _habit(notification)
    services.set_check_ins(ada, habit.pk, date(2026, 3, 10), 3)
    services.update_habit(ada, habit.pk, goal=2)

    response = _check_in(client, notification)

    assert response.json()["today_count"] == 3


@pytest.mark.django_db
def test_a_snoozed_habit_reminder_fires_again_once(
    client: Client,
    ada: User,
    freeze_time: Callable[[datetime], None],
) -> None:
    notification = _fired_reminder(ada, freeze_time)

    response = _snooze(client, notification, "in_15_minutes")
    early = _sweep_at(freeze_time, datetime(2026, 3, 10, 9, 14, tzinfo=UTC))
    on_time = _sweep_at(freeze_time, datetime(2026, 3, 10, 9, 15, tzinfo=UTC))
    later = _sweep_at(freeze_time, datetime(2026, 3, 10, 9, 16, tzinfo=UTC))

    assert response.status_code == 204
    assert (early, on_time, later) == (1, 2, 2)
    again = Notification.objects.filter(user=ada).first()
    assert again is not None
    assert (again.title, again.habit) == ("Drink water", _habit(notification))
    notification.refresh_from_db()
    assert notification.read_at is not None


@pytest.mark.django_db
def test_snoozing_leaves_tomorrows_reminder_as_it_was(
    client: Client,
    ada: User,
    freeze_time: Callable[[datetime], None],
) -> None:
    notification = _fired_reminder(ada, freeze_time)
    _snooze(client, notification, "in_1_hour")

    snoozed = _sweep_at(freeze_time, datetime(2026, 3, 10, 10, 0, tzinfo=UTC))
    tomorrow = _sweep_at(freeze_time, datetime(2026, 3, 11, 9, 0, tzinfo=UTC))

    assert (snoozed, tomorrow) == (2, 3)


@pytest.mark.django_db
def test_snoozing_until_tomorrow_morning_follows_the_users_time_zone(
    client: Client,
    ada: User,
    freeze_time: Callable[[datetime], None],
) -> None:
    notification = _fired_reminder(ada, freeze_time)
    # Move tomorrow's own Reminder out of the way, to see the snooze alone.
    services.update_habit(ada, _habit(notification).pk, reminder_time=time(20, 0))
    set_time_zone(ada, "Asia/Kolkata")

    _snooze(client, notification, "tomorrow_morning")

    # 09:00 on 11 March in Kolkata (UTC+05:30).
    early = _sweep_at(freeze_time, datetime(2026, 3, 11, 3, 29, tzinfo=UTC))
    on_time = _sweep_at(freeze_time, datetime(2026, 3, 11, 3, 30, tzinfo=UTC))
    assert (early, on_time) == (1, 2)


@pytest.mark.django_db
def test_a_snooze_more_than_an_hour_late_is_dropped(
    client: Client,
    ada: User,
    freeze_time: Callable[[datetime], None],
) -> None:
    notification = _fired_reminder(ada, freeze_time)
    _snooze(client, notification, "in_15_minutes")

    late = _sweep_at(freeze_time, datetime(2026, 3, 10, 10, 16, tzinfo=UTC))
    after = _sweep_at(freeze_time, datetime(2026, 3, 10, 10, 17, tzinfo=UTC))

    assert (late, after) == (1, 1)


@pytest.mark.django_db
def test_a_snoozed_reminder_stays_quiet_once_the_goal_is_met(
    client: Client,
    ada: User,
    freeze_time: Callable[[datetime], None],
) -> None:
    notification = _fired_reminder(ada, freeze_time)
    _snooze(client, notification, "in_15_minutes")
    _check_in(client, notification)

    assert _sweep_at(freeze_time, datetime(2026, 3, 10, 9, 15, tzinfo=UTC)) == 1


@pytest.mark.django_db
def test_a_snoozed_reminder_stays_quiet_once_the_habit_is_archived(
    client: Client,
    ada: User,
    freeze_time: Callable[[datetime], None],
) -> None:
    notification = _fired_reminder(ada, freeze_time)
    _snooze(client, notification, "in_15_minutes")
    services.archive_habit(ada, _habit(notification).pk)

    assert _sweep_at(freeze_time, datetime(2026, 3, 10, 9, 15, tzinfo=UTC)) == 1


@pytest.mark.parametrize("action", ["check-in", "snooze-habit"])
@pytest.mark.django_db
def test_another_users_notification_is_not_found(
    client: Client,
    grace: User,
    freeze_time: Callable[[datetime], None],
    action: str,
) -> None:
    notification = _fired_reminder(grace, freeze_time)

    response = client.post(
        f"/api/v1/notifications/{notification.pk}/{action}",
        {"until": "in_15_minutes"},
        content_type="application/json",
    )

    assert response.status_code == 404
    habit = _habit(notification)
    habit.refresh_from_db()
    assert (habit.check_ins.count(), habit.snoozed_until) == (0, None)
    notification.refresh_from_db()
    assert notification.read_at is None


@pytest.mark.parametrize("action", ["check-in", "snooze-habit"])
@pytest.mark.django_db
def test_a_notification_without_a_habit_is_not_found(
    client: Client,
    ada: User,
    action: str,
) -> None:
    notification = notify(ada, title="Test notification")

    response = client.post(
        f"/api/v1/notifications/{notification.pk}/{action}",
        {"until": "in_15_minutes"},
        content_type="application/json",
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Habit Reminder notification not found."}
