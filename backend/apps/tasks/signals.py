"""Signal handlers that keep every user's Inbox in place and their Reminders on time."""

from __future__ import annotations

from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.accounts.models import User
from apps.tasks import reminders, services
from apps.tasks.models import Project, Task

# The fields whose change can move a Reminder's fire time or stop it firing.
_TASK_FIELDS = frozenset(
    {"status", "due_date", "due_time", "start_date", "start_time", "deleted_at", "project"},
)
_PROJECT_FIELDS = frozenset({"archived_at", "deleted_at"})
_USER_FIELDS = frozenset({"time_zone"})


def _touches(update_fields: frozenset[str] | None, fields: frozenset[str]) -> bool:
    """Whether a save may have changed any of the fields; a save of every field may have."""
    return update_fields is None or not fields.isdisjoint(update_fields)


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


@receiver(post_save, sender=User)
def reschedule_after_time_zone_change(
    sender: type[User],  # noqa: ARG001 - Django passes every argument by keyword
    instance: User,
    *,
    created: bool,
    update_fields: frozenset[str] | None,
    **kwargs: object,  # noqa: ARG001 - Django passes every argument by keyword
) -> None:
    """Move the user's Reminders with their time zone, since clock times keep their value.

    A signal for the same reason as the Inbox: the zone also changes in the Django admin.
    """
    if not created and _touches(update_fields, _USER_FIELDS):
        reminders.reschedule(instance.tasks.all())


@receiver(post_save, sender=Project)
def reschedule_after_project_change(
    sender: type[Project],  # noqa: ARG001 - Django passes every argument by keyword
    instance: Project,
    *,
    created: bool,
    update_fields: frozenset[str] | None,
    **kwargs: object,  # noqa: ARG001 - Django passes every argument by keyword
) -> None:
    """Stop or restart the Project's Reminders when it is archived, trashed or brought back."""
    if not created and _touches(update_fields, _PROJECT_FIELDS):
        reminders.reschedule(instance.tasks.all())


@receiver(post_save, sender=Task)
def reschedule_after_task_change(
    sender: type[Task],  # noqa: ARG001 - Django passes every argument by keyword
    instance: Task,
    *,
    created: bool,
    update_fields: frozenset[str] | None,
    **kwargs: object,  # noqa: ARG001 - Django passes every argument by keyword
) -> None:
    """Move the Task's Reminders after its dates, Status, Trash state or Project changed.

    A signal rather than a call in each service, because many paths save a Task: edits, Status
    cascades through a tree, moves and restores from Trash.
    """
    if not created and _touches(update_fields, _TASK_FIELDS):
        reminders.reschedule(Task.objects.filter(pk=instance.pk))
