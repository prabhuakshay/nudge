"""Deleting Trash units for good: the daily purge, Delete forever and Empty Trash.

A unit goes with everything on its Tasks: Comments, Activity, Mentions, Reminders and
Attachments. Attachment files are deleted only once the deletion commits, so a rollback never
loses one. Whatever outlives the unit is detached first rather than swept along: a Subtask
trashed on its own before its parent becomes the last root of its Project, which is where
restoring it would put it anyway.
"""

from __future__ import annotations

from datetime import timedelta
from typing import TYPE_CHECKING

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from fractional_indexing import generate_key_between

from apps.tasks.models import Attachment, Project, Task

if TYPE_CHECKING:
    import uuid
    from collections.abc import Collection

    from django.db.models.fields.files import FieldFile

    from apps.accounts.models import User


def purge_expired_trash() -> int:
    """Delete every unit that has been in Trash for `TRASH_RETENTION_DAYS`; return how many."""
    cutoff = timezone.now() - timedelta(days=settings.TRASH_RETENTION_DAYS)
    expired = Task.objects.filter(trash_unit__isnull=False, deleted_at__lte=cutoff)
    return _delete_units(set(expired.values_list("trash_unit", flat=True)))


def delete_forever(user: User, task_ids: Collection[int]) -> bool:
    """Delete the units the given trashed Tasks belong to; False if any isn't one of the user's.

    Nothing is deleted unless every id is found, so a stale or foreign id changes nothing.
    """
    found = user.tasks.filter(pk__in=task_ids, trash_unit__isnull=False)
    units = dict(found.values_list("pk", "trash_unit"))
    if len(units) != len(set(task_ids)):
        return False
    _delete_units(set(units.values()))
    return True


def empty_trash(user: User) -> int:
    """Delete every unit in the user's Trash; return how many there were."""
    trashed = user.tasks.filter(trash_unit__isnull=False)
    return _delete_units(set(trashed.values_list("trash_unit", flat=True)))


def _delete_units(units: set[uuid.UUID | None]) -> int:
    """Delete the units and the files of their Attachments; return how many units there were."""
    if not units:
        return 0
    tasks = Task.objects.filter(trash_unit__in=units)
    with transaction.atomic():
        _detach(Task.objects.filter(parent__in=tasks).exclude(trash_unit__in=units))
        files = [attachment.file for attachment in Attachment.objects.filter(task__in=tasks)]
        tasks.delete()
        transaction.on_commit(lambda: _delete_files(files))
    return len(units)


def _detach(orphans: Collection[Task]) -> None:
    """Make each Task the last root of its Project, so it outlives the parent being deleted."""
    for orphan in orphans:
        # Locking the Project serialises inserts into it, so two Tasks never get the same key.
        Project.objects.select_for_update().get(pk=orphan.project_id)
        roots = Task.objects.filter(project_id=orphan.project_id, parent__isnull=True)
        last = roots.order_by("-position", "-id").values_list("position", flat=True).first()
        orphan.parent = None
        orphan.position = str(generate_key_between(last, None))
        orphan.save(update_fields=["parent", "position", "updated_at"])


def _delete_files(files: list[FieldFile]) -> None:
    """Delete stored Attachment files whose rows are gone."""
    for file in files:
        file.delete(save=False)
