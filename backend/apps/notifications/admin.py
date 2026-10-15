"""Django admin registration for notifications and push subscriptions."""

from __future__ import annotations

from django.contrib import admin

from apps.notifications.models import Notification, PushSubscription


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin[Notification]):
    """Notifications, for checking what a user was sent."""

    list_display = ("title", "user", "created_at", "read_at")
    list_filter = ("created_at",)
    search_fields = ("title", "user__email")
    raw_id_fields = ("user",)


@admin.register(PushSubscription)
class PushSubscriptionAdmin(admin.ModelAdmin[PushSubscription]):
    """Browsers registered for push, for removing one that misbehaves."""

    list_display = ("__str__", "user", "created_at")
    search_fields = ("user__email", "endpoint")
    raw_id_fields = ("user",)
