"""Creating notifications, managing them for the notification center and pushing them to devices.

Push uses the Web Push protocol with VAPID keys from settings, so it works with every browser's
push service and needs no third-party account.
"""

from __future__ import annotations

import json
import logging
from typing import TYPE_CHECKING

from django.conf import settings
from django.utils import timezone
from pywebpush import WebPushException, webpush

from apps.notifications.models import Notification, PushSubscription

if TYPE_CHECKING:
    from django.db.models import QuerySet

    from apps.accounts.models import User
    from apps.habits.models import Habit
    from apps.tasks.models import Reminder

logger = logging.getLogger(__name__)

RECENT_LIMIT = 50

# A notification that can't be delivered within a day is stale; push services drop it after this.
PUSH_TTL_SECONDS = 24 * 60 * 60
PUSH_TIMEOUT_SECONDS = 10

# Push services answer these when the browser has unsubscribed or the subscription expired.
_SUBSCRIPTION_GONE = frozenset({404, 410})


def push_is_configured() -> bool:
    """Return whether the server has VAPID keys, without which browsers can't subscribe."""
    return bool(settings.VAPID_PUBLIC_KEY and settings.VAPID_PRIVATE_KEY)


def notify(  # noqa: PLR0913 - one optional link per kind of Reminder that sends notifications
    user: User,
    title: str,
    body: str = "",
    url: str = "",
    *,
    reminder: Reminder | None = None,
    habit: Habit | None = None,
) -> Notification:
    """Add a notification to the user's notification center and push it to their devices.

    A notification from a Reminder offers to complete or snooze its Task; `habit` links one to
    the Habit whose Reminder sent it. Pushing happens in the
    background worker, so a slow push service never delays the caller.
    """
    from apps.notifications.tasks import push_notification  # noqa: PLC0415 - it imports this module

    notification = Notification.objects.create(
        user=user,
        title=title,
        body=body,
        url=url,
        reminder=reminder,
        habit=habit,
    )
    if push_is_configured():
        push_notification.defer(notification_id=notification.pk)
    return notification


def send_test_notification(user: User) -> Notification:
    """Notify the user so they can check that notifications reach their devices."""
    return notify(
        user,
        title="Test notification",
        body="Notifications from Nudge will look like this.",
        url="/",
    )


def recent_notifications(user: User) -> QuerySet[Notification]:
    """Return the user's latest notifications, newest first."""
    return user.notifications.all()[:RECENT_LIMIT]


def unread_count(user: User) -> int:
    """Return how many of the user's notifications they haven't read."""
    return user.notifications.filter(read_at__isnull=True).count()


def mark_read(user: User, notification_id: int) -> bool:
    """Mark one of the user's notifications as read; return whether it exists."""
    notification = user.notifications.filter(pk=notification_id).first()
    if notification is None:
        return False
    if notification.read_at is None:
        notification.read_at = timezone.now()
        notification.save(update_fields=["read_at"])
    return True


def mark_all_read(user: User) -> None:
    """Mark every unread notification of the user's as read."""
    user.notifications.filter(read_at__isnull=True).update(read_at=timezone.now())


def dismiss(user: User, notification_id: int) -> bool:
    """Delete one of the user's notifications; return whether it existed."""
    deleted, _ = user.notifications.filter(pk=notification_id).delete()
    return deleted > 0


def save_push_subscription(user: User, endpoint: str, p256dh: str, auth: str) -> PushSubscription:
    """Register a browser to receive the user's notifications.

    A browser has one endpoint, so registering it again replaces its keys and owner. That keeps a
    shared browser from receiving the previous user's notifications.
    """
    subscription, _ = PushSubscription.objects.update_or_create(
        endpoint=endpoint,
        defaults={"user": user, "p256dh": p256dh, "auth": auth},
    )
    return subscription


def delete_push_subscription(user: User, endpoint: str) -> None:
    """Stop pushing the user's notifications to this browser."""
    user.push_subscriptions.filter(endpoint=endpoint).delete()


def push_to_devices(notification_id: int) -> None:
    """Push a notification to every browser its user registered.

    Browsers whose push service reports the subscription gone are forgotten; other failures are
    logged so one broken device doesn't stop the rest.
    """
    notification = Notification.objects.select_related("user").filter(pk=notification_id).first()
    if notification is None:
        return
    payload = json.dumps(
        {
            "id": notification.pk,
            "title": notification.title,
            "body": notification.body,
            "url": notification.url,
            "is_reminder": notification.is_reminder,
        },
    )
    for subscription in notification.user.push_subscriptions.all():
        _push(subscription, payload)


def _push(subscription: PushSubscription, payload: str) -> None:
    try:
        webpush(
            subscription_info={
                "endpoint": subscription.endpoint,
                "keys": {"p256dh": subscription.p256dh, "auth": subscription.auth},
            },
            data=payload,
            vapid_private_key=settings.VAPID_PRIVATE_KEY,
            vapid_claims={"sub": settings.VAPID_SUBJECT},
            ttl=PUSH_TTL_SECONDS,
            timeout=PUSH_TIMEOUT_SECONDS,
        )
    except WebPushException as error:
        if error.status_code in _SUBSCRIPTION_GONE:
            subscription.delete()
            return
        logger.warning("Push to %s failed: %s", subscription, error)
    # Network failures from `requests` are OSErrors.
    except OSError as error:
        logger.warning("Push to %s failed: %s", subscription, error)
