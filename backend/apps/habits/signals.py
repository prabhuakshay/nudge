"""Signal handlers that keep Habit Reminders on time."""

from __future__ import annotations

from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.accounts.models import User
from apps.habits import reminders


@receiver(post_save, sender=User)
def reschedule_after_time_zone_change(
    sender: type[User],  # noqa: ARG001 - Django passes every argument by keyword
    instance: User,
    *,
    created: bool,
    update_fields: frozenset[str] | None,
    **kwargs: object,  # noqa: ARG001 - Django passes every argument by keyword
) -> None:
    """Move the user's Habit Reminders with their time zone, since reminder times are clock times.

    A signal rather than a call in the accounts services, because the zone also changes in the
    Django admin and the accounts app shouldn't know about Habits.
    """
    if created or (update_fields is not None and "time_zone" not in update_fields):
        return
    reminders.reschedule(instance.habits.select_related("owner"))
