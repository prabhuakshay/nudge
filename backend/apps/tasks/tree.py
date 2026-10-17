"""Subtask trees: reading a Task's ancestors and descendants, and keeping their Statuses consistent.

A tree holds one rule across Status changes: a Closed Task has no open descendants. Closing a Task
closes the open work under it, and opening work under a Closed Task reopens it. Every knock-on
change is recorded in the changed Task's Activity and returned as an `AffectedTask`, so Undo can
put it back.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from django.db.models import Q
from django.utils import timezone

from apps.tasks.models import CLOSED_STATUSES, MAX_DEPTH, OPEN_STATUSES, Task, TaskActivity
from apps.tasks.rows import as_rows

if TYPE_CHECKING:
    from django.db.models import QuerySet

    from apps.accounts.models import User
    from apps.tasks.models import Section


@dataclass(frozen=True)
class AffectedTask:
    """A Task whose Status a change touched, with what it had before, so Undo can restore it."""

    id: int
    prior_status: Task.Status
    prior_blocked_reason: str


def root_status_in(statuses: tuple[Task.Status, ...]) -> Q:
    """Match Tasks whose root, which is the Task itself for a root, has one of the statuses."""
    match = Q()
    path = ""
    for _ in range(MAX_DEPTH + 1):
        match |= Q(**{f"{path}parent__isnull": True, f"{path}status__in": statuses})
        path += "parent__"
    return match


def root_in_section(section: Section | None) -> Q:
    """Match Tasks whose root, which is the Task itself for a root, is in the Section.

    None matches the trees in No section. Subtasks hold no Section, so their root's is what counts.
    """
    match = Q(parent__isnull=True, section=section)
    path = ""
    for _ in range(MAX_DEPTH):
        path += "parent__"
        # Without it a root would match "its parent's Section is None" through the empty join.
        exists = Q(**{f"{path}isnull": False})
        match |= exists & Q(**{f"{path}parent__isnull": True, f"{path}section": section})
    return match


def below(roots: list[Task]) -> QuerySet[Task]:
    """Return the live descendants of the roots, in manual order within each sibling set."""
    match = Q(parent__in=roots) | Q(parent__parent__in=roots) | Q(parent__parent__parent__in=roots)
    return Task.objects.filter(match, deleted_at__isnull=True)


def rows_below(roots: list[Task], user: User) -> list[Task]:
    """Return the live descendants of the roots as list rows."""
    return list(as_rows(below(roots), user)) if roots else []


def descendants(task: Task) -> list[Task]:
    """Return every live Subtask below the Task as list rows, in manual order per sibling set."""
    return rows_below([task], task.owner)


def ancestors(task: Task) -> list[Task]:
    """Return the Tasks above the Task, root first."""
    chain: list[Task] = []
    parent = task.parent
    while parent is not None:
        chain.insert(0, parent)
        parent = parent.parent
    return chain


def height(task: Task) -> int:
    """Return how many levels of live Subtasks hang below the Task: 0 when it has none."""
    for levels in range(MAX_DEPTH, 0, -1):
        lookup = "__".join(["parent"] * levels)
        if Task.objects.filter(**{lookup: task}, deleted_at__isnull=True).exists():
            return levels
    return 0


def cascade_status(task: Task) -> list[AffectedTask]:
    """Restore "a Closed Task has no open descendants" after the Task's Status changed."""
    if task.status in CLOSED_STATUSES:
        return _close_descendants(task)
    return reopen_ancestors(task)


def _close_descendants(task: Task) -> list[AffectedTask]:
    """Give every open or Blocked descendant of a Closed Task the Task's Status."""
    affected = []
    for descendant in (
        below([task]).filter(status__in=OPEN_STATUSES).select_for_update(of=("self",))
    ):
        affected.append(
            AffectedTask(descendant.pk, Task.Status(descendant.status), descendant.blocked_reason),
        )
        set_status(descendant, Task.Status(task.status), via={"via_parent": task.title})
    return affected


def reopen_ancestors(task: Task) -> list[AffectedTask]:
    """Reopen every Closed ancestor of the Task, if the Task is open; a Closed one opens no work."""
    affected: list[AffectedTask] = []
    if task.status not in OPEN_STATUSES:
        return affected
    ancestor = task.parent
    while ancestor is not None:
        if ancestor.status in CLOSED_STATUSES:
            affected.append(AffectedTask(ancestor.pk, Task.Status(ancestor.status), ""))
            set_status(ancestor, Task.Status.OPEN, via={"via_subtask": task.title})
        ancestor = ancestor.parent
    return affected


def set_status(task: Task, status: Task.Status, via: dict[str, str]) -> None:
    """Give a Task a Status as the knock-on effect of a change to a relative, and log why."""
    data = {"old": task.status, "new": status, "blocked_reason": "", **via}
    task.status = status
    task.completed_at = timezone.now() if status in CLOSED_STATUSES else None
    task.blocked_reason = ""
    task.save(update_fields=["status", "completed_at", "blocked_reason", "updated_at"])
    TaskActivity.objects.create(task=task, kind=TaskActivity.Kind.STATUS_CHANGED, data=data)
