"""Signal handlers that keep every user's Inbox in place."""

from __future__ import annotations

from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.accounts.models import User
from apps.tasks import services


@receiver(post_save, sender=User)
def create_inbox_for_new_user(
    sender: type[User],  # noqa: ARG001 - Django passes every argument by keyword
    instance: User,
    *,
    created: bool,
    **kwargs: object,  # noqa: ARG001 - Django passes every argument by keyword
) -> None:
    """Give a newly created user their Inbox, so a Task always has a Project to land in.

    A signal rather than a call in the user manager, because accounts are also created in the
    Django admin and the accounts app shouldn't know about Tasks.
    """
    if created:
        services.create_inbox(instance)
