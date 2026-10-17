"""Database models for notifications and the devices they are pushed to."""

from __future__ import annotations

from typing import ClassVar, override
from urllib.parse import urlsplit

from django.conf import settings
from django.db import models
from django.utils import timezone


class Notification(models.Model):
    """A message for one user, kept in their notification center and pushed to their devices."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    title = models.CharField(max_length=200)
    body = models.TextField(blank=True)
    url = models.CharField(
        max_length=500,
        blank=True,
        help_text="Path in the app to open when the notification is clicked.",
    )
    reminder = models.ForeignKey(
        "tasks.Reminder",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="notifications",
        help_text="The Reminder that sent it, which lets the user complete or snooze its Task.",
    )
    habit = models.ForeignKey(
        "habits.Habit",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="notifications",
        help_text="The Habit whose Reminder sent it.",
    )
    created_at = models.DateTimeField(default=timezone.now)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        """Model options."""

        ordering = ("-created_at", "-id")
        indexes: ClassVar = [
            models.Index(fields=["user", "-created_at"], name="notification_user_recent_idx"),
        ]

    @override
    def __str__(self) -> str:
        """Return the title, which is what the user sees first."""
        return self.title

    @property
    def is_reminder(self) -> bool:
        """Whether a Reminder sent it, so its Task can still be completed or snoozed from it."""
        return self.reminder_id is not None


class PushSubscription(models.Model):
    """One browser's Web Push endpoint, registered by the user to receive notifications.

    The endpoint identifies the browser, so it is unique: when another user signs in on the same
    browser and turns push on, the subscription moves to them.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="push_subscriptions",
    )
    endpoint = models.URLField(max_length=2048, unique=True)
    p256dh = models.CharField(max_length=200)
    auth = models.CharField(max_length=100)
    created_at = models.DateTimeField(default=timezone.now)

    @override
    def __str__(self) -> str:
        """Return the endpoint's host, enough to tell which push service it uses."""
        return urlsplit(self.endpoint).netloc
