"""Tests for a repeating Task's Reminders as it moves on, and closing it from a Notification."""

from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta
from typing import TYPE_CHECKING

import pytest
from django.test import Client

from apps.accounts.services import set_time_zone
from apps.notifications.models import Notification
from apps.tasks import reminders, services
from apps.tasks.dates import TaskDates

if TYPE_CHECKING:
    from collections.abc import Callable

    from apps.accounts.models import User

# Friday 6 November 2026, 13:30 in London, when a Reminder 30 minutes before 14:00 fires.
FIRED = datetime(2026, 11, 6, 13, 30, tzinfo=UTC)


@pytest.fixture
def client(ada: User, freeze_time: Callable[[datetime], None]) -> Client:
    # Stop the clock before signing in, or the session would have expired by then.
    freeze_time(FIRED - timedelta(hours=1))
    set_time_zone(ada, "Europe/London")
    client = Client()
    client.force_login(ada)
    return client


def _fired_reminder(
    user: User,
    freeze_time: Callable[[datetime], None],
    due: date,
) -> Notification:
    """Give the user a daily Task due at 14:00 with a Reminder 30 minutes before, and fire it."""
    task = services.create_task(services.inbox(user), "Take the pills")
    edit = services.TaskEdit(
        dates=TaskDates(due_date=due, due_time=time(14, 0)),
        reminders=[timedelta(minutes=-30)],
        repeat_rule="FREQ=DAILY",
    )
    services.update_task(user, task.pk, edit)
    freeze_time(datetime.combine(due, time(13, 30), tzinfo=UTC))
    reminders.send_due_reminders()
    return Notification.objects.get(user=user)


@pytest.mark.django_db
def test_a_snooze_for_the_old_occurrence_is_dropped(
    client: Client,
    ada: User,
    freeze_time: Callable[[datetime], None],
) -> None:
    notification = _fired_reminder(ada, freeze_time, date(2026, 11, 6))
    client.post(
        f"/api/v1/notifications/{notification.pk}/snooze",
        {"until": "in_15_minutes"},
        content_type="application/json",
    )

    response = client.post(f"/api/v1/notifications/{notification.pk}/complete")
    freeze_time(FIRED + timedelta(minutes=15))

    assert response.json()["task"]["due_date"] == "2026-11-07"
    assert reminders.send_due_reminders() == 0


@pytest.mark.django_db
def test_an_occurrence_not_due_yet_cannot_be_completed_from_its_reminder(
    client: Client,
    ada: User,
    freeze_time: Callable[[datetime], None],
) -> None:
    notification = _fired_reminder(ada, freeze_time, date(2026, 11, 6))
    services.update_task(
        ada,
        int(notification.url.rsplit("=", 1)[1]),
        services.TaskEdit(dates=TaskDates(due_date=date(2026, 11, 7), due_time=time(14, 0))),
    )

    response = client.post(f"/api/v1/notifications/{notification.pk}/complete")

    assert response.status_code == 422
    assert response.json() == {"detail": "This repeating task isn't due yet."}
