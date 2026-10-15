"""Moving a Task within its tree, into another tree or to another Project.

The client says where a Task goes by its new parent and the sibling it now follows, never by a
key. The server generates the key while holding a lock on the target Project, so two moves into
one sibling set never get the same key. A Task carries its Subtasks wherever it goes, and the move
writes one row for it plus, across Projects, the Project of each Subtask.
"""

from __future__ import annotations

from dataclasses import dataclass

from django.db import transaction
from fractional_indexing import generate_key_between

from apps.tasks import repeat
from apps.tasks.archive import ensure_writable
from apps.tasks.models import MAX_DEPTH, Project, Task, TaskActivity
from apps.tasks.rows import as_rows
from apps.tasks.services import TaskChange, TaskRuleError
from apps.tasks.tree import (
    ancestors,
    height,
    move_descendants,
    moved_event,
    reopen_ancestors,
)


@dataclass(frozen=True)
class Destination:
    """Where a Task goes, already resolved to the owner's Project and parent.

    No `project` means the parent's Project, or the Task's own for a root. No `parent` means the
    top level. No `after_id` puts it first among its new siblings; an `after_id` that isn't one
    of them puts it last.
    """

    project: Project | None = None
    parent: Task | None = None
    after_id: int | None = None


def move_task(task: Task, destination: Destination) -> TaskChange:
    """Move the Task and its Subtasks to the destination.

    A change of Project or parent is logged; a reorder among the same siblings isn't. A Task that
    becomes a Subtask drops its pin and its Repeat, since only roots have them, and an open Task
    moved under Closed work reopens it.

    Raises:
        TaskRuleError: The destination is under the Task itself, nests too deep, or names a
            parent in another Project than the one given.
        ArchivedProjectError: The Task is in an archived Project, or would move into one.
    """
    project = _target_project(task, destination)
    ensure_writable(task.project)
    ensure_writable(project)
    parent = destination.parent
    _check_parent(task, parent)
    from_project, from_parent = task.project.name, task.parent_title
    with transaction.atomic():
        # Locking the Project serialises writes to its sibling sets, so keys never collide.
        Project.objects.select_for_update().get(pk=project.pk)
        events = []
        if parent is not None and task.pinned_at is not None:
            task.pinned_at = None
            events.append(TaskActivity(task=task, kind=TaskActivity.Kind.UNPINNED))
        if parent is not None:
            events.extend(repeat.remove(task))
        if project.pk != task.project_id:
            move_descendants(task, project)
        relocated = project.pk != task.project_id or task.parent_id != _pk(parent)
        task.position = _key_after(project, parent, task, destination.after_id)
        task.project, task.parent = project, parent
        task.save(
            update_fields=[
                "project",
                "parent",
                "position",
                "pinned_at",
                "repeat_rule",
                "repeat_anchor",
                "updated_at",
            ],
        )
        if relocated:
            events.append(moved_event(task, from_project, from_parent))
        TaskActivity.objects.bulk_create(events)
        affected = reopen_ancestors(task)
    fresh = as_rows(Task.objects.filter(pk=task.pk), task.owner).get()
    return TaskChange(task=fresh, affected=affected)


def _pk(task: Task | None) -> int | None:
    return None if task is None else task.pk


def _target_project(task: Task, destination: Destination) -> Project:
    parent = destination.parent
    if parent is None:
        return destination.project or task.project
    if destination.project is not None and destination.project.pk != parent.project_id:
        message = "A subtask lives in its parent's project."
        raise TaskRuleError(message)
    return parent.project


def _check_parent(task: Task, parent: Task | None) -> None:
    if parent is None:
        return
    if parent.pk == task.pk or task.pk in {above.pk for above in ancestors(parent)}:
        message = "A task can't go under itself or one of its subtasks."
        raise TaskRuleError(message)
    if parent.depth + 1 + height(task) > MAX_DEPTH:
        message = "Tasks can only nest four levels deep."
        raise TaskRuleError(message)


def _key_after(project: Project, parent: Task | None, task: Task, after_id: int | None) -> str:
    """Return a key right after `after_id` among the Task's new siblings, first or last."""
    siblings = list(
        project.tasks.filter(parent=parent)
        .exclude(pk=task.pk)
        .order_by("position", "id")
        .values_list("pk", "position"),
    )
    keys = [key for _, key in siblings]
    if after_id is None:
        return str(generate_key_between(None, keys[0] if keys else None))
    ids = [pk for pk, _ in siblings]
    if after_id not in ids:
        return str(generate_key_between(keys[-1] if keys else None, None))
    index = ids.index(after_id)
    following = keys[index + 1] if index + 1 < len(keys) else None
    return str(generate_key_between(keys[index], following))
