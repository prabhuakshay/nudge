"""Tests for completing and snoozing a Task from its Reminder's Notification."""

from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta
from typing import TYPE_CHECKING

import pytest
from django.test import Client

from apps.accounts.services import set_time_zone
from apps.notifications.models import Notification
from apps.notifications.services import notify
from apps.tasks import projects, reminders, services
from apps.tasks.dates import TaskDates

if TYPE_CHECKING:
    from collections.abc import Callable

    from django.test.client import _MonkeyPatchedWSGIResponse as Response

    from apps.accounts.models import User

# 13:30 in London (GMT in November), when a Reminder 30 minutes before 14:00 fires.
FIRED = datetime(2026, 11, 6, 13, 30, tzinfo=UTC)


@pytest.fixture
def client(ada: User, freeze_time: Callable[[datetime], None]) -> Client:
    # Stop the clock before signing in, or the session would have expired by then.
    freeze_time(FIRED - timedelta(hours=1))
    client = Client()
    client.force_login(ada)
    return client


def _fired_reminder(
    user: User,
    freeze_time: Callable[[datetime], None],
    title: str = "Call the bank",
) -> Notification:
    """Give the user a Task due at 14:00 with a Reminder 30 minutes before, and fire it."""
    set_time_zone(user, "Europe/London")
    freeze_time(FIRED - timedelta(hours=1))
    task = services.create_task(services.inbox(user), title)
    edit = services.TaskEdit(
        dates=TaskDates(due_date=date(2026, 11, 6), due_time=time(14, 0)),
        reminders=[timedelta(minutes=-30)],
    )
    services.update_task(user, task.pk, edit)
    freeze_time(FIRED)
    reminders.send_due_reminders()
    return Notification.objects.get(user=user, title=title)


def _task_id(notification: Notification) -> int:
    """Return the id of the Task the notification opens, from its `?task=` url."""
    return int(notification.url.rsplit("=", 1)[1])


def _snooze(client: Client, notification: Notification, until: str) -> Response:
    return client.post(
        f"/api/v1/notifications/{notification.pk}/snooze",
        {"until": until},
        content_type="application/json",
    )


@pytest.mark.parametrize(
    "path",
    ["/api/v1/notifications/1/complete", "/api/v1/notifications/1/snooze"],
)
@pytest.mark.django_db
def test_every_endpoint_requires_a_session(path: str) -> None:
    response = Client().post(path, {"until": "in_15_minutes"}, content_type="application/json")

    assert response.status_code == 401


@pytest.mark.django_db
def test_a_reminder_notification_offers_its_actions(
    client: Client,
    ada: User,
    freeze_time: Callable[[datetime], None],
) -> None:
    _fired_reminder(ada, freeze_time)
    notify(ada, title="Test notification")

    items = client.get("/api/v1/notifications").json()["items"]

    assert [(item["title"], item["is_reminder"]) for item in items] == [
        ("Test notification", False),
        ("Call the bank", True),
    ]


@pytest.mark.django_db
def test_a_snoozed_reminder_fires_again_once(
    client: Client,
    ada: User,
    freeze_time: Callable[[datetime], None],
) -> None:
    notification = _fired_reminder(ada, freeze_time)

    response = _snooze(client, notification, "in_15_minutes")
    freeze_time(FIRED + timedelta(minutes=14))
    early = reminders.send_due_reminders()
    freeze_time(FIRED + timedelta(minutes=15))
    on_time = reminders.send_due_reminders()
    later = reminders.send_due_reminders()

    assert response.status_code == 204
    assert (early, on_time, later) == (0, 1, 0)
    again = Notification.objects.filter(user=ada).first()
    assert again is not None
    assert (again.title, again.body) == ("Call the bank", "Today 14:00 · Inbox")
    assert again.reminder_id == notification.reminder_id


@pytest.mark.parametrize(
    ("until", "fires_at"),
    [
        ("in_1_hour", FIRED + timedelta(hours=1)),
        ("in_3_hours", FIRED + timedelta(hours=3)),
        # 09:00 in London the next day.
        ("tomorrow_morning", datetime(2026, 11, 7, 9, 0, tzinfo=UTC)),
    ],
)
@pytest.mark.django_db
def test_a_snooze_picks_when_it_fires_again(
    client: Client,
    ada: User,
    freeze_time: Callable[[datetime], None],
    until: str,
    fires_at: datetime,
) -> None:
    notification = _fired_reminder(ada, freeze_time)
    _snooze(client, notification, until)

    freeze_time(fires_at - timedelta(minutes=1))
    early = reminders.send_due_reminders()
    freeze_time(fires_at)
    on_time = reminders.send_due_reminders()

    assert (early, on_time) == (0, 1)


@pytest.mark.django_db
def test_tomorrow_morning_follows_the_users_time_zone(
    client: Client,
    ada: User,
    freeze_time: Callable[[datetime], None],
) -> None:
    notification = _fired_reminder(ada, freeze_time)
    set_time_zone(ada, "Asia/Kolkata")
    # It is 19:00 in Kolkata, so tomorrow morning is 09:00 on the 7th there: 03:30 UTC.
    _snooze(client, notification, "tomorrow_morning")

    freeze_time(datetime(2026, 11, 7, 3, 30, tzinfo=UTC))

    assert reminders.send_due_reminders() == 1


@pytest.mark.django_db
def test_a_snooze_never_changes_the_task(
    client: Client,
    ada: User,
    freeze_time: Callable[[datetime], None],
) -> None:
    notification = _fired_reminder(ada, freeze_time)
    task_id = _task_id(notification)
    before = client.get(f"/api/v1/tasks/{task_id}").json()

    _snooze(client, notification, "in_1_hour")

    assert client.get(f"/api/v1/tasks/{task_id}").json() == before


@pytest.mark.django_db
def test_a_snoozed_reminder_stays_quiet_once_its_task_is_completed(
    client: Client,
    ada: User,
    freeze_time: Callable[[datetime], None],
) -> None:
    notification = _fired_reminder(ada, freeze_time)
    _snooze(client, notification, "in_15_minutes")

    client.post(f"/api/v1/notifications/{notification.pk}/complete")
    freeze_time(FIRED + timedelta(minutes=15))

    assert reminders.send_due_reminders() == 0


@pytest.mark.django_db
def test_a_snooze_more_than_an_hour_late_is_dropped(
    client: Client,
    ada: User,
    freeze_time: Callable[[datetime], None],
) -> None:
    notification = _fired_reminder(ada, freeze_time)
    _snooze(client, notification, "in_15_minutes")

    freeze_time(FIRED + timedelta(hours=1, minutes=15))
    late = reminders.send_due_reminders()
    freeze_time(FIRED + timedelta(hours=1, minutes=20))

    assert (late, reminders.send_due_reminders()) == (0, 0)


@pytest.mark.django_db
def test_snoozing_marks_the_notification_read(
    client: Client,
    ada: User,
    freeze_time: Callable[[datetime], None],
) -> None:
    notification = _fired_reminder(ada, freeze_time)

    _snooze(client, notification, "in_1_hour")

    assert client.get("/api/v1/notifications").json()["unread_count"] == 0


@pytest.mark.django_db
def test_completing_from_a_reminder_applies_the_status_rules(
    client: Client,
    ada: User,
    freeze_time: Callable[[datetime], None],
) -> None:
    notification = _fired_reminder(ada, freeze_time)
    task_id = _task_id(notification)
    parent = services.live_task(ada, task_id)
    assert parent is not None
    subtask = services.create_subtask(parent, "Find the card").task

    response = client.post(f"/api/v1/notifications/{notification.pk}/complete")

    assert response.status_code == 200
    body = response.json()
    assert body["task"]["status"] == "completed"
    assert {(row["id"], row["prior_status"]) for row in body["affected"]} == {
        (task_id, "open"),
        (subtask.pk, "open"),
    }
    assert client.get(f"/api/v1/tasks/{subtask.pk}").json()["status"] == "completed"
    activity = client.get(f"/api/v1/tasks/{task_id}/activity").json()["items"]
    assert activity[0]["kind"] == "status_changed"
    assert client.get("/api/v1/notifications").json()["unread_count"] == 0


@pytest.mark.django_db
def test_a_task_in_an_archived_project_cannot_be_completed(
    client: Client,
    ada: User,
    freeze_time: Callable[[datetime], None],
) -> None:
    notification = _fired_reminder(ada, freeze_time)
    work = projects.create_project(ada, "Work")
    services.update_task(ada, _task_id(notification), services.TaskEdit(project=work))
    projects.archive_project(ada, work.pk)

    response = client.post(f"/api/v1/notifications/{notification.pk}/complete")

    assert response.status_code == 422


@pytest.mark.parametrize("action", ["complete", "snooze"])
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
        {"until": "in_1_hour"},
        content_type="application/json",
    )

    assert response.status_code == 404
    assert Notification.objects.get(pk=notification.pk).read_at is None


@pytest.mark.parametrize("action", ["complete", "snooze"])
@pytest.mark.django_db
def test_a_notification_without_a_reminder_has_no_actions(
    client: Client,
    ada: User,
    action: str,
) -> None:
    notification = notify(ada, title="Test notification")

    response = client.post(
        f"/api/v1/notifications/{notification.pk}/{action}",
        {"until": "in_1_hour"},
        content_type="application/json",
    )

    assert response.status_code == 404
