"""Request and response shapes for the notifications API."""

from __future__ import annotations

from datetime import datetime  # noqa: TC003 - Pydantic needs the type at runtime

from ninja import Field, Schema
from pydantic import field_validator


class NotificationOut(Schema):
    """A notification as the notification center shows it."""

    id: int
    title: str
    body: str
    url: str = Field(description="Path in the app to open, or empty.")
    created_at: datetime
    read_at: datetime | None


class NotificationListOut(Schema):
    """The latest notifications and how many of all the user's notifications are unread."""

    items: list[NotificationOut]
    unread_count: int


class PushConfigOut(Schema):
    """What a browser needs to subscribe to push."""

    public_key: str | None = Field(
        description="The server's VAPID public key, or null when push isn't set up.",
    )


class PushKeysIn(Schema):
    """The browser's keys for encrypting pushes to it."""

    p256dh: str = Field(max_length=200)
    auth: str = Field(max_length=100)


class PushSubscriptionIn(Schema):
    """A browser's push subscription, as `PushSubscription.toJSON()` returns it."""

    endpoint: str = Field(max_length=2048)
    keys: PushKeysIn

    @field_validator("endpoint")
    @classmethod
    def _require_https(cls, endpoint: str) -> str:
        # The worker posts to this URL; browsers' push services are always HTTPS, and refusing
        # anything else keeps the endpoint from pointing at plain-HTTP services on our network.
        if not endpoint.startswith("https://"):
            message = "The endpoint must be an HTTPS URL."
            raise ValueError(message)
        return endpoint


class PushUnsubscribeIn(Schema):
    """The endpoint of the browser to stop pushing to."""

    endpoint: str
