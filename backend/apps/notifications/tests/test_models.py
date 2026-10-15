"""Tests for the notification models."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from apps.notifications.models import Notification, PushSubscription

if TYPE_CHECKING:
    from apps.accounts.models import User


@pytest.mark.django_db
def test_notification_is_shown_by_its_title(ada: User) -> None:
    notification = Notification.objects.create(user=ada, title="Pay rent")

    assert str(notification) == "Pay rent"


@pytest.mark.django_db
def test_push_subscription_is_shown_by_its_push_service(ada: User) -> None:
    subscription = PushSubscription.objects.create(
        user=ada,
        endpoint="https://fcm.googleapis.com/fcm/send/abc",
        p256dh="key",
        auth="secret",
    )

    assert str(subscription) == "fcm.googleapis.com"
