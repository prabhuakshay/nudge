"""Business rules for Projects and Tasks: the Inbox, ordering, listing, Status and Activity.

Every function takes the user first and reaches Projects and Tasks through that user's related
managers, so another user's ids behave as if they don't exist. A change and the Activity event
that records it are saved in one transaction, so a Task's history never misses or invents a change.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from fractional_indexing import generate_key_between

from apps.tasks.models import (
    CLOSED_STATUSES,
    INBOX_NAME,
    MAX_DEPTH,
    OPEN_STATUSES,
    Project,
    Task,
    TaskActivity,
)
from apps.tasks.pagination import Page, newest_first

if TYPE_CHECKING:
    from django.db.models import QuerySet

    from apps.accounts.models import User


class TaskRuleError(Exception):
    """A change that would break a Task rule. The message says which, in the user's words."""


@dataclass(frozen=True)
class TaskEdit:
    """The fields of a Task to change; a field left as None stays as it is."""

    title: str | None = None
    description: str | None = None
    status: Task.Status | None = None
    blocked_reason: str | None = None
    priority: Task.Priority | None = None


@dataclass(frozen=True)
class AffectedTask:
    """A Task whose Status a change touched, with what it had before, so Undo can restore it."""

    id: int
    prior_status: Task.Status
    prior_blocked_reason: str


@dataclass(frozen=True)
class TaskChange:
    """A Task after a change, and the Tasks whose Status it changed."""

    task: Task
    affected: list[AffectedTask]


def create_inbox(user: User) -> Project:
    """Create the user's Inbox."""
    return Project.objects.create(owner=user, name=INBOX_NAME, is_inbox=True)


def inbox(user: User) -> Project:
    """Return the user's Inbox."""
    return user.projects.get(is_inbox=True)


def live_project(user: User, project_id: int) -> Project | None:
    """Return one of the user's Projects that isn't in Trash, or None."""
    return user.projects.filter(pk=project_id, deleted_at__isnull=True).first()


def _live_tasks(project: Project) -> QuerySet[Task]:
    # Three hops reach a root from the deepest Subtask, so a row's depth costs no queries.
    return project.tasks.filter(deleted_at__isnull=True).select_related("parent__parent__parent")


def _root_status_in(statuses: tuple[Task.Status, ...]) -> Q:
    """Match Tasks whose root, which is the Task itself for a root, has one of the statuses."""
    match = Q()
    path = ""
    for _ in range(MAX_DEPTH + 1):
        match |= Q(**{f"{path}parent__isnull": True, f"{path}status__in": statuses})
        path += "parent__"
    return match


def _below(roots: list[Task]) -> QuerySet[Task]:
    """Return the live descendants of the roots, in manual order within each sibling set."""
    below = Q(parent__in=roots) | Q(parent__parent__in=roots) | Q(parent__parent__parent__in=roots)
    return Task.objects.filter(below, deleted_at__isnull=True).select_related(
        "parent__parent__parent",
    )


def descendants(task: Task) -> list[Task]:
    """Return every live Subtask below the Task, in manual order within each sibling set."""
    return list(_below([task]))


def ancestors(task: Task) -> list[Task]:
    """Return the Tasks above the Task, root first."""
    chain: list[Task] = []
    parent = task.parent
    while parent is not None:
        chain.insert(0, parent)
        parent = parent.parent
    return chain


def open_tasks(project: Project) -> QuerySet[Task]:
    """Return the Project's open trees: open roots and every Subtask under them, in manual order.

    Subtasks come whatever their Status, so a list can show done steps under open work.
    """
    return _live_tasks(project).filter(_root_status_in(OPEN_STATUSES))


def open_task_count(project: Project) -> int:
    """Return how many open and Blocked Tasks, Subtasks included, the Project holds."""
    return _live_tasks(project).filter(status__in=OPEN_STATUSES).count()


def closed_tasks(project: Project, cursor: str | None = None) -> Page[Task]:
    """Return a page of the Project's Closed trees, most recently completed root first.

    Each page holds its Closed roots, newest first, then every Subtask under them in manual
    order. A Closed root has no open descendants, so the whole tree is Closed.

    Raises:
        InvalidCursorError: The cursor wasn't one this function returned.
    """
    roots = _live_tasks(project).filter(parent__isnull=True, status__in=CLOSED_STATUSES)
    page = newest_first(roots, "completed_at", cursor)
    return Page(items=[*page.items, *_below(page.items)], next_cursor=page.next_cursor)


def create_task(project: Project, title: str) -> Task:
    """Create a Task in the Project, first among its roots, owned by the Project's owner."""
    with transaction.atomic():
        # Locking the Project serialises inserts into it, so two Tasks never get the same key.
        Project.objects.select_for_update().get(pk=project.pk)
        roots = project.tasks.filter(parent__isnull=True).order_by("position", "id")
        first = roots.values_list("position", flat=True).first()
        task = Task.objects.create(
            owner_id=project.owner_id,
            project=project,
            title=title,
            position=str(generate_key_between(None, first)),
        )
        TaskActivity.objects.create(task=task, kind=TaskActivity.Kind.CREATED, at=task.created_at)
        return task


def create_subtask(parent: Task, title: str) -> TaskChange:
    """Create a Subtask last under the parent, in the parent's Project.

    A Closed Task can't hold open work, so adding under one reopens it and its Closed ancestors.

    Raises:
        TaskRuleError: The parent is already at the deepest level.
    """
    if parent.depth >= MAX_DEPTH:
        message = "Tasks can only nest four levels deep."
        raise TaskRuleError(message)
    with transaction.atomic():
        Project.objects.select_for_update().get(pk=parent.project_id)
        siblings = parent.subtasks.order_by("-position", "-id")
        last = siblings.values_list("position", flat=True).first()
        task = Task.objects.create(
            owner_id=parent.owner_id,
            project_id=parent.project_id,
            parent=parent,
            title=title,
            position=str(generate_key_between(last, None)),
        )
        TaskActivity.objects.create(task=task, kind=TaskActivity.Kind.CREATED, at=task.created_at)
        return TaskChange(task=task, affected=_reopen_ancestors(task))


def live_task(user: User, task_id: int) -> Task | None:
    """Return one of the user's Tasks that isn't in Trash, or None."""
    return user.tasks.filter(pk=task_id, deleted_at__isnull=True).first()


_EDITABLE_FIELDS = ("title", "description", "status", "blocked_reason", "priority", "completed_at")


def update_task(user: User, task_id: int, edit: TaskEdit) -> TaskChange | None:
    """Change the given fields of one of the user's Tasks; return None if it isn't theirs.

    A Status change keeps the tree consistent: closing a Task closes its open descendants with
    the same Status, and reopening one reopens its Closed ancestors. Every Task the change
    touched comes back in `affected`.

    Raises:
        TaskRuleError: The edit gives a Blocked reason to a Task that isn't Blocked.
    """
    task = live_task(user, task_id)
    if task is None:
        return None
    before = {name: getattr(task, name) for name in _EDITABLE_FIELDS}
    _apply(task, edit)
    changed = [name for name in _EDITABLE_FIELDS if getattr(task, name) != before[name]]
    affected = []
    cascaded: list[AffectedTask] = []
    with transaction.atomic():
        if changed:
            task.save(update_fields=[*changed, "updated_at"])
        if "status" in changed:
            affected.append(
                AffectedTask(task.pk, Task.Status(before["status"]), before["blocked_reason"]),
            )
            cascaded = _cascade_status(task)
        closed_subtasks = len(cascaded) if task.status in CLOSED_STATUSES else 0
        TaskActivity.objects.bulk_create(_activity(task, before, closed_subtasks))
    return TaskChange(task=task, affected=affected + cascaded)


def _apply(task: Task, edit: TaskEdit) -> None:
    if edit.title is not None:
        task.title = edit.title
    if edit.description is not None:
        task.description = edit.description
    if edit.priority is not None:
        task.priority = edit.priority
    if edit.status is not None and edit.status != task.status:
        task.status = edit.status
        task.completed_at = timezone.now() if edit.status in CLOSED_STATUSES else None
        # A reason belongs to one spell of being Blocked, so any Status change drops it.
        task.blocked_reason = ""
    if edit.blocked_reason is not None:
        if edit.blocked_reason and task.status != Task.Status.BLOCKED:
            message = "Only a Blocked task can have a Blocked reason."
            raise TaskRuleError(message)
        task.blocked_reason = edit.blocked_reason


def _cascade_status(task: Task) -> list[AffectedTask]:
    """Restore "a Closed Task has no open descendants" after the Task's Status changed."""
    if task.status in CLOSED_STATUSES:
        return _close_descendants(task)
    return _reopen_ancestors(task)


def _close_descendants(task: Task) -> list[AffectedTask]:
    """Give every open or Blocked descendant of a Closed Task the Task's Status."""
    affected = []
    for descendant in (
        _below([task]).filter(status__in=OPEN_STATUSES).select_for_update(of=("self",))
    ):
        affected.append(
            AffectedTask(descendant.pk, Task.Status(descendant.status), descendant.blocked_reason),
        )
        _set_status(descendant, Task.Status(task.status), via={"via_parent": task.title})
    return affected


def _reopen_ancestors(task: Task) -> list[AffectedTask]:
    """Reopen every Closed ancestor of an open Task."""
    affected = []
    ancestor = task.parent
    while ancestor is not None:
        if ancestor.status in CLOSED_STATUSES:
            affected.append(AffectedTask(ancestor.pk, Task.Status(ancestor.status), ""))
            _set_status(ancestor, Task.Status.OPEN, via={"via_subtask": task.title})
        ancestor = ancestor.parent
    return affected


def _set_status(task: Task, status: Task.Status, via: dict[str, str]) -> None:
    """Give a Task a Status as the knock-on effect of a change to a relative, and log why."""
    data = {"old": task.status, "new": status, "blocked_reason": "", **via}
    task.status = status
    task.completed_at = timezone.now() if status in CLOSED_STATUSES else None
    task.blocked_reason = ""
    task.save(update_fields=["status", "completed_at", "blocked_reason", "updated_at"])
    TaskActivity.objects.create(task=task, kind=TaskActivity.Kind.STATUS_CHANGED, data=data)


def _activity(task: Task, before: dict[str, object], closed_subtasks: int) -> list[TaskActivity]:
    """Return the history events for the difference between `before` and the Task as it is now."""
    events = []
    if task.title != before["title"]:
        data = {"old": before["title"], "new": task.title}
        events.append(TaskActivity(task=task, kind=TaskActivity.Kind.TITLE_CHANGED, data=data))
    if task.description != before["description"]:
        events.append(TaskActivity(task=task, kind=TaskActivity.Kind.DESCRIPTION_EDITED))
    if task.status != before["status"]:
        data = {"old": before["status"], "new": task.status, "blocked_reason": task.blocked_reason}
        if closed_subtasks:
            data["closed_subtasks"] = closed_subtasks
        events.append(TaskActivity(task=task, kind=TaskActivity.Kind.STATUS_CHANGED, data=data))
    if task.priority != before["priority"]:
        data = {"old": before["priority"], "new": task.priority}
        events.append(TaskActivity(task=task, kind=TaskActivity.Kind.PRIORITY_CHANGED, data=data))
    return events


def task_activity(task: Task, cursor: str | None = None) -> Page[TaskActivity]:
    """Return a page of the Task's history, newest first.

    Raises:
        InvalidCursorError: The cursor wasn't one this function returned.
    """
    return newest_first(task.activity.all(), "at", cursor)


def activity_count(task: Task) -> int:
    """Return how many events the Task's history holds."""
    return task.activity.count()
