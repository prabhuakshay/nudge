"""Deleting Trash units for good: the daily purge, Delete forever and Empty Trash.

A unit goes with everything on its Tasks: Comments, Activity, Mentions, Reminders and
Attachments. Attachment files are deleted only once the deletion commits, so a rollback never
loses one. Whatever outlives the unit is detached first rather than swept along: a Subtask
trashed on its own before its parent becomes the last root of its Project, which is where
restoring it would put it anyway, and a Task trashed on its own before its Project moves to the
Inbox, where restoring it would put it anyway.

A Project unit is the Project and the Tasks deleted with it; they all share its `trash_unit`.
"""

from __future__ import annotations

from datetime import timedelta
from typing import TYPE_CHECKING

from django.conf import settings
from django.db import transaction
from django.db.models import F
from django.utils import timezone
from fractional_indexing import generate_key_between

from apps.tasks import services
from apps.tasks.models import Attachment, Project, Task

if TYPE_CHECKING:
    import uuid
    from collections.abc import Collection

    from django.db.models import QuerySet
    from django.db.models.fields.files import FieldFile

    from apps.accounts.models import User


def purge_expired_trash() -> int:
    """Delete every unit that has been in Trash for `TRASH_RETENTION_DAYS`; return how many."""
    cutoff = timezone.now() - timedelta(days=settings.TRASH_RETENTION_DAYS)
    expired_tasks = Task.objects.filter(trash_unit__isnull=False, deleted_at__lte=cutoff)
    expired_projects = Project.objects.filter(trash_unit__isnull=False, deleted_at__lte=cutoff)
    return _delete_units(
        {
            *expired_tasks.values_list("trash_unit", flat=True),
            *expired_projects.values_list("trash_unit", flat=True),
        }
    )


def delete_forever(
    user: User,
    task_ids: Collection[int],
    project_ids: Collection[int] = (),
) -> bool:
    """Delete the units of the given trashed Tasks and Projects; False if any isn't the user's.

    Nothing is deleted unless every id is found, so a stale or foreign id changes nothing. A Task
    deleted along with its Project goes only with the Project.
    """
    tasks = (
        user.tasks.filter(pk__in=task_ids, trash_unit__isnull=False)
        .exclude(project__trash_unit=F("trash_unit"))
        .values_list("pk", "trash_unit")
    )
    projects = user.projects.filter(pk__in=project_ids, trash_unit__isnull=False).values_list(
        "pk", "trash_unit"
    )
    task_units, project_units = dict(tasks), dict(projects)
    if len(task_units) != len(set(task_ids)) or len(project_units) != len(set(project_ids)):
        return False
    _delete_units({*task_units.values(), *project_units.values()})
    return True


def empty_trash(user: User) -> int:
    """Delete every unit in the user's Trash; return how many there were."""
    tasks = user.tasks.filter(trash_unit__isnull=False)
    projects = user.projects.filter(trash_unit__isnull=False)
    return _delete_units(
        {
            *tasks.values_list("trash_unit", flat=True),
            *projects.values_list("trash_unit", flat=True),
        }
    )


def _delete_units(units: set[uuid.UUID | None]) -> int:
    """Delete the units and the files of their Attachments; return how many units there were."""
    if not units:
        return 0
    tasks = Task.objects.filter(trash_unit__in=units)
    with transaction.atomic():
        _detach(Task.objects.filter(parent__in=tasks).exclude(trash_unit__in=units))
        projects = Project.objects.filter(trash_unit__in=units)
        _rehome(Task.objects.filter(project__in=projects).exclude(trash_unit__in=units))
        files = [attachment.file for attachment in Attachment.objects.filter(task__in=tasks)]
        tasks.delete()
        projects.delete()
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


def _rehome(strays: QuerySet[Task]) -> None:
    """Move trashed Tasks out of a Project about to be deleted, into their owner's Inbox.

    Run after `_detach`, so each stray's parent is gone or moves with it; each root becomes the
    last root of the Inbox.
    """
    for stray in strays.select_related("owner"):
        inbox = services.inbox(stray.owner)
        if stray.parent_id is None:
            # Locking the Project serialises inserts into it, so two Tasks never get the same key.
            Project.objects.select_for_update().get(pk=inbox.pk)
            roots = inbox.tasks.filter(parent__isnull=True)
            last = roots.order_by("-position", "-id").values_list("position", flat=True).first()
            stray.position = str(generate_key_between(last, None))
        stray.project = inbox
        stray.save(update_fields=["position", "project", "updated_at"])


def _delete_files(files: list[FieldFile]) -> None:
    """Delete stored Attachment files whose rows are gone."""
    for file in files:
        file.delete(save=False)
