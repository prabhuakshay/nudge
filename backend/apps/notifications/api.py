"""Notification center and push subscription endpoints."""

from __future__ import annotations

from http import HTTPStatus
from typing import TYPE_CHECKING

from django.conf import settings
from ninja import Router, Status

from apps.accounts.models import User
from apps.core.schemas import ErrorOut
from apps.notifications import services
from apps.notifications.schemas import (
    NotificationListOut,
    NotificationOut,
    PushConfigOut,
    PushSubscriptionIn,
    PushUnsubscribeIn,
)

if TYPE_CHECKING:
    from django.http import HttpRequest

router = Router()

_NOT_FOUND = ErrorOut(detail="Notification not found.")


def _user(request: HttpRequest) -> User:
    user = request.user
    assert isinstance(user, User)  # noqa: S101 - the API's global auth only lets signed-in users in
    return user


@router.get("", response=NotificationListOut, summary="List notifications")
def notifications(request: HttpRequest) -> NotificationListOut:
    """Return the user's latest notifications and their unread count."""
    user = _user(request)
    return NotificationListOut(
        items=[NotificationOut.from_orm(n) for n in services.recent_notifications(user)],
        unread_count=services.unread_count(user),
    )


@router.post(
    "/{int:notification_id}/read",
    response={HTTPStatus.NO_CONTENT: None, HTTPStatus.NOT_FOUND: ErrorOut},
    summary="Mark a notification as read",
)
def mark_read(request: HttpRequest, notification_id: int) -> Status[None] | Status[ErrorOut]:
    """Mark one notification as read."""
    if not services.mark_read(_user(request), notification_id):
        return Status(HTTPStatus.NOT_FOUND, _NOT_FOUND)
    return Status(HTTPStatus.NO_CONTENT, None)


@router.post("/read-all", response={HTTPStatus.NO_CONTENT: None}, summary="Mark all as read")
def mark_all_read(request: HttpRequest) -> Status[None]:
    """Mark every notification as read."""
    services.mark_all_read(_user(request))
    return Status(HTTPStatus.NO_CONTENT, None)


@router.delete(
    "/{int:notification_id}",
    response={HTTPStatus.NO_CONTENT: None, HTTPStatus.NOT_FOUND: ErrorOut},
    summary="Dismiss a notification",
)
def dismiss(request: HttpRequest, notification_id: int) -> Status[None] | Status[ErrorOut]:
    """Remove one notification from the notification center."""
    if not services.dismiss(_user(request), notification_id):
        return Status(HTTPStatus.NOT_FOUND, _NOT_FOUND)
    return Status(HTTPStatus.NO_CONTENT, None)


@router.post(
    "/test", response={HTTPStatus.CREATED: NotificationOut}, summary="Send a test notification"
)
def send_test(request: HttpRequest) -> Status[NotificationOut]:
    """Notify the user, to check that notifications reach their devices."""
    notification = services.send_test_notification(_user(request))
    return Status(HTTPStatus.CREATED, NotificationOut.from_orm(notification))


@router.get("/push", response=PushConfigOut, summary="Get push settings")
def push_config(request: HttpRequest) -> PushConfigOut:
    """Return the key browsers need to subscribe, if the server has push set up."""
    return PushConfigOut(
        public_key=settings.VAPID_PUBLIC_KEY if services.push_is_configured() else None,
    )


@router.post(
    "/push/subscriptions",
    response={HTTPStatus.NO_CONTENT: None},
    summary="Register a browser for push",
)
def subscribe(request: HttpRequest, subscription: PushSubscriptionIn) -> Status[None]:
    """Push the user's notifications to this browser."""
    services.save_push_subscription(
        _user(request),
        endpoint=subscription.endpoint,
        p256dh=subscription.keys.p256dh,
        auth=subscription.keys.auth,
    )
    return Status(HTTPStatus.NO_CONTENT, None)


@router.delete(
    "/push/subscriptions",
    response={HTTPStatus.NO_CONTENT: None},
    summary="Unregister a browser from push",
)
def unsubscribe(request: HttpRequest, subscription: PushUnsubscribeIn) -> Status[None]:
    """Stop pushing the user's notifications to this browser."""
    services.delete_push_subscription(_user(request), subscription.endpoint)
    return Status(HTTPStatus.NO_CONTENT, None)
