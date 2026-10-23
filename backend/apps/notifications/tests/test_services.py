"""Tests for notification operations and push delivery."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import TYPE_CHECKING

import pytest
from pywebpush import WebPushException

from apps.notifications import services
from apps.notifications.models import Notification, PushSubscription

if TYPE_CHECKING:
    from procrastinate.testing import InMemoryConnector

    from apps.accounts.models import User

ENDPOINT = "https://push.example.com/send/1"
PUSH_FAILED = "Push failed"


@dataclass
class _Response:
    status_code: int
    text: str = ""


def subscribe(user: User, endpoint: str = ENDPOINT) -> PushSubscription:
    return services.save_push_subscription(user, endpoint, p256dh="key", auth="secret")


@pytest.mark.django_db
@pytest.mark.usefixtures("push_configured")
def test_notify_saves_the_notification_and_queues_a_push(
    ada: User,
    jobs: InMemoryConnector,
) -> None:
    notification = services.notify(ada, "Pay rent", body="Due today", url="/inbox")

    assert Notification.objects.get() == notification
    assert [(job["task_name"], job["args"]) for job in jobs.jobs.values()] == [
        ("notifications.push", {"notification_id": notification.pk}),
    ]


@pytest.mark.django_db
def test_notify_skips_the_push_when_push_is_not_set_up(ada: User, jobs: InMemoryConnector) -> None:
    services.notify(ada, "Pay rent")

    assert Notification.objects.count() == 1
    assert jobs.jobs == {}


@pytest.mark.django_db
def test_send_test_notification_notifies_the_user(ada: User) -> None:
    notification = services.send_test_notification(ada)

    assert notification.user == ada
    assert notification.title == "Test notification"


@pytest.mark.django_db
def test_recent_notifications_are_the_users_own_newest_first(ada: User, grace: User) -> None:
    first = services.notify(ada, "First")
    second = services.notify(ada, "Second")
    services.notify(grace, "Not Ada's")

    assert list(services.recent_notifications(ada)) == [second, first]


@pytest.mark.django_db
def test_mark_read_reads_only_the_users_own_notification(ada: User, grace: User) -> None:
    notification = services.notify(ada, "Pay rent")

    assert services.mark_read(grace, notification.pk) is False
    assert services.unread_count(ada) == 1
    assert services.mark_read(ada, notification.pk) is True
    assert services.unread_count(ada) == 0


@pytest.mark.django_db
def test_mark_read_keeps_the_first_read_time(ada: User) -> None:
    notification = services.notify(ada, "Pay rent")
    services.mark_read(ada, notification.pk)
    notification.refresh_from_db()
    first_read = notification.read_at

    services.mark_read(ada, notification.pk)

    notification.refresh_from_db()
    assert notification.read_at == first_read


@pytest.mark.django_db
def test_mark_all_read_leaves_other_users_alone(ada: User, grace: User) -> None:
    services.notify(ada, "One")
    services.notify(ada, "Two")
    services.notify(grace, "Grace's")

    services.mark_all_read(ada)

    assert services.unread_count(ada) == 0
    assert services.unread_count(grace) == 1


@pytest.mark.django_db
def test_dismiss_deletes_only_the_users_own_notification(ada: User, grace: User) -> None:
    notification = services.notify(ada, "Pay rent")

    assert services.dismiss(grace, notification.pk) is False
    assert services.dismiss(ada, notification.pk) is True
    assert not Notification.objects.exists()


@pytest.mark.django_db
def test_saving_a_subscription_again_moves_the_browser_to_the_new_user(
    ada: User,
    grace: User,
) -> None:
    subscribe(ada)

    services.save_push_subscription(grace, ENDPOINT, p256dh="new-key", auth="new-secret")

    subscription = PushSubscription.objects.get()
    assert (subscription.user, subscription.p256dh, subscription.auth) == (
        grace,
        "new-key",
        "new-secret",
    )


@pytest.mark.django_db
def test_delete_push_subscription_only_removes_the_users_own(ada: User, grace: User) -> None:
    subscribe(ada)

    services.delete_push_subscription(grace, ENDPOINT)
    assert PushSubscription.objects.count() == 1

    services.delete_push_subscription(ada, ENDPOINT)
    assert not PushSubscription.objects.exists()


@pytest.mark.django_db
@pytest.mark.usefixtures("push_configured")
def test_push_to_devices_sends_the_notification_to_every_browser(
    ada: User,
    grace: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sent: list[tuple[str, dict[str, str]]] = []

    def fake_webpush(**kwargs: object) -> None:
        info = kwargs["subscription_info"]
        assert isinstance(info, dict)
        assert kwargs["vapid_claims"] == {"sub": "mailto:admin@example.com"}
        sent.append((info["endpoint"], json.loads(str(kwargs["data"]))))

    monkeypatch.setattr(services, "webpush", fake_webpush)
    subscribe(ada, "https://push.example.com/phone")
    subscribe(ada, "https://push.example.com/laptop")
    subscribe(grace, "https://push.example.com/grace")
    notification = services.notify(ada, "Pay rent", body="Due today", url="/inbox")

    services.push_to_devices(notification.pk)

    payload = {
        "id": notification.pk,
        "title": "Pay rent",
        "body": "Due today",
        "url": "/inbox",
        "is_reminder": False,
        "is_habit_reminder": False,
    }
    assert sorted(sent) == [
        ("https://push.example.com/laptop", payload),
        ("https://push.example.com/phone", payload),
    ]


@pytest.mark.django_db
@pytest.mark.parametrize("status", [404, 410])
def test_push_to_devices_forgets_browsers_that_unsubscribed(
    ada: User,
    monkeypatch: pytest.MonkeyPatch,
    status: int,
) -> None:
    def gone(**_kwargs: object) -> None:
        raise WebPushException(PUSH_FAILED, response=_Response(status))

    monkeypatch.setattr(services, "webpush", gone)
    subscribe(ada)
    notification = services.notify(ada, "Pay rent")

    services.push_to_devices(notification.pk)

    assert not PushSubscription.objects.exists()


@pytest.mark.django_db
@pytest.mark.parametrize(
    "error",
    [WebPushException(PUSH_FAILED, response=_Response(500)), ConnectionError("unreachable")],
)
def test_push_to_devices_keeps_the_browser_and_logs_other_failures(
    ada: User,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
    error: Exception,
) -> None:
    def fail(**_kwargs: object) -> None:
        raise error

    monkeypatch.setattr(services, "webpush", fail)
    subscribe(ada)
    notification = services.notify(ada, "Pay rent")

    with caplog.at_level(logging.WARNING):
        services.push_to_devices(notification.pk)

    assert PushSubscription.objects.count() == 1
    assert "Push to push.example.com failed" in caplog.text


@pytest.mark.django_db
def test_push_to_devices_skips_a_notification_dismissed_before_the_job_ran(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def unexpected(**_kwargs: object) -> None:
        pytest.fail("nothing should be pushed")

    monkeypatch.setattr(services, "webpush", unexpected)

    services.push_to_devices(12345)
