"""Business rules for Projects and Tasks: Inbox, order, Status, pins, dates and Activity.

Every function takes the user first and reaches Projects and Tasks through that user's related
managers, so another user's ids behave as if they don't exist. A change and the Activity event
that records it are saved in one transaction, so a Task's history never misses or invents a change.
How a change spreads through a Task's Subtask tree lives in `apps.tasks.tree`.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, replace
from typing import TYPE_CHECKING

from django.db import transaction
from django.db.models import F
from django.utils import timezone
from fractional_indexing import generate_key_between

from apps.core.palette import PaletteColor
from apps.tasks import reminders, repeat
from apps.tasks.archive import ensure_writable
from apps.tasks.dates import TaskDates
from apps.tasks.mentions import TEXT_FIELDS, check_mentions, sync_mentions
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
from apps.tasks.rows import as_rows, with_counts, with_overdue
from apps.tasks.tree import (
    AffectedTask,
    cascade_status,
    move_tree,
    moved_event,
    reopen_ancestors,
    root_status_in,
    rows_below,
)

if TYPE_CHECKING:
    from datetime import timedelta

    from django.db.models import QuerySet

    from apps.accounts.models import User


class TaskRuleError(Exception):
    """A change that would break a Task rule. The message says which, in the user's words."""


@dataclass(frozen=True)
class TaskEdit:
    """The fields of a Task to change; a field left as None stays as it is.

    `dates` replaces all of the Task's dates at once; an empty `TaskDates` removes them, and the
    Reminders with them. `reminders` replaces the Reminders, as offsets.
    """

    title: str | None = None
    description: str | None = None
    status: Task.Status | None = None
    blocked_reason: str | None = None
    priority: Task.Priority | None = None
    pinned: bool | None = None
    dates: TaskDates | None = None
    reminders: list[timedelta] | None = None
    project: Project | None = None
    repeat_rule: str | None = None
    repeat_from: Task.RepeatFrom | None = None


@dataclass(frozen=True)
class TaskChange:
    """A Task after a change, and the Tasks whose Status it changed."""

    task: Task
    affected: list[AffectedTask]


def create_inbox(user: User) -> Project:
    """Create the user's Inbox."""
    return Project.objects.create(
        owner=user,
        name=INBOX_NAME,
        color=PaletteColor.BLUE,
        icon=Project.Icon.INBOX,
        is_inbox=True,
    )


def inbox(user: User) -> Project:
    """Return the user's Inbox."""
    return user.projects.get(is_inbox=True)


def live_project(user: User, project_id: int) -> Project | None:
    """Return one of the user's Projects that isn't in Trash, or None."""
    return user.projects.filter(pk=project_id, deleted_at__isnull=True).first()


def _live_tasks(project: Project) -> QuerySet[Task]:
    return as_rows(project.tasks.filter(deleted_at__isnull=True), project.owner)


def open_tasks(project: Project) -> QuerySet[Task]:
    """Return the Project's open trees: open roots and every Subtask under them.

    Pinned roots come first, then the rest in manual order. Subtasks come whatever their Status,
    so a list can show done steps under open work.
    """
    return (
        _live_tasks(project)
        .filter(root_status_in(OPEN_STATUSES))
        .order_by(F("pinned_at").asc(nulls_last=True), "position", "id")
    )


def closed_tasks(project: Project, cursor: str | None = None) -> Page[Task]:
    """Return a page of the Project's Closed trees, most recently completed root first.

    Each page holds its Closed roots, newest first, then every Subtask under them in manual
    order. A Closed root has no open descendants, so the whole tree is Closed.

    Raises:
        InvalidCursorError: The cursor wasn't one this function returned.
    """
    roots = _live_tasks(project).filter(parent__isnull=True, status__in=CLOSED_STATUSES)
    page = newest_first(roots, "completed_at", cursor)
    rows = [*page.items, *rows_below(page.items, project.owner)]
    return Page(items=rows, next_cursor=page.next_cursor)


def _first_position(project: Project) -> str:
    """Return a key before every root Task in the Project. Call it inside a transaction."""
    # Locking the Project serialises inserts into it, so two Tasks never get the same key.
    Project.objects.select_for_update().get(pk=project.pk)
    roots = project.tasks.filter(parent__isnull=True).order_by("position", "id")
    first = roots.values_list("position", flat=True).first()
    return str(generate_key_between(None, first))


def create_task(project: Project, title: str, dates: TaskDates | None = None) -> Task:
    """Create a Task in the Project, first among its roots, owned by the Project's owner.

    Raises:
        ArchivedProjectError: The Project is archived.
        MentionError: The title mentions a Person the owner doesn't have.
    """
    ensure_writable(project)
    check_mentions(project.owner, title)
    with transaction.atomic():
        task = Task.objects.create(
            owner_id=project.owner_id,
            project=project,
            title=title,
            position=_first_position(project),
            **asdict(dates or TaskDates()),
        )
        TaskActivity.objects.create(task=task, kind=TaskActivity.Kind.CREATED, at=task.created_at)
        sync_mentions(task)
    return with_overdue(project.tasks.all(), project.owner).get(pk=task.pk)


def create_subtask(parent: Task, title: str) -> TaskChange:
    """Create a Subtask last under the parent, in the parent's Project.

    A Closed Task can't hold open work, so adding under one reopens it and its Closed ancestors.

    Raises:
        TaskRuleError: The parent is already at the deepest level.
        ArchivedProjectError: The parent is in an archived Project.
        MentionError: The title mentions a Person the owner doesn't have.
    """
    ensure_writable(parent.project)
    if parent.depth >= MAX_DEPTH:
        message = "Tasks can only nest four levels deep."
        raise TaskRuleError(message)
    check_mentions(parent.owner, title)
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
        sync_mentions(task)
        affected = reopen_ancestors(task)
    fresh = as_rows(Task.objects.filter(pk=task.pk), parent.owner).get()
    return TaskChange(task=fresh, affected=affected)


def duplicate_task(user: User, task_id: int) -> Task | None:
    """Copy one of the user's Tasks to right after it; return None if it isn't theirs.

    The copy is a fresh open Task with the original's title, Description and Priority, under the
    same parent. Being open, it reopens any Closed ancestors.

    Raises:
        ArchivedProjectError: The Task is in an archived Project.
    """
    original = live_task(user, task_id)
    if original is None:
        return None
    ensure_writable(original.project)
    with transaction.atomic():
        # Locking the Project serialises inserts into it, so two Tasks never get the same key.
        Project.objects.select_for_update().get(pk=original.project_id)
        siblings = original.project.tasks.filter(parent_id=original.parent_id)
        later = siblings.filter(position__gt=original.position).order_by("position")
        following = later.values_list("position", flat=True).first()
        task = Task.objects.create(
            owner=user,
            project_id=original.project_id,
            parent_id=original.parent_id,
            title=original.title,
            description=original.description,
            priority=original.priority,
            position=str(generate_key_between(original.position, following)),
        )
        TaskActivity.objects.create(task=task, kind=TaskActivity.Kind.CREATED, at=task.created_at)
        sync_mentions(task)
        reopen_ancestors(task)
    return as_rows(user.tasks.filter(pk=task.pk), user).get()


def live_task(user: User, task_id: int) -> Task | None:
    """Return one of the user's Tasks that isn't in Trash, or None."""
    tasks = with_counts(user.tasks.filter(pk=task_id, deleted_at__isnull=True))
    return with_overdue(tasks, user).first()


_EDITABLE_FIELDS = (
    "title",
    "description",
    "status",
    "blocked_reason",
    "priority",
    "completed_at",
    "pinned_at",
    "due_date",
    "due_time",
    "start_date",
    "start_time",
    "repeat_rule",
    "repeat_anchor",
    "repeat_from",
)


def update_task(user: User, task_id: int, edit: TaskEdit) -> TaskChange | None:
    """Change the given fields of one of the user's Tasks; return None if it isn't theirs.

    A Status change keeps the tree consistent: closing a Task closes its open descendants with
    the same Status, and reopening one reopens its Closed ancestors. Every Task the change
    touched comes back in `affected`.

    Moving it to another of the user's Projects puts it first among the roots there, with its
    Subtasks under it; a Subtask moved out becomes a root, since Subtasks share their root's
    Project.

    Raises:
        TaskRuleError: The edit gives a Blocked reason to a Task that isn't Blocked, or pins a
            Subtask.
        ReminderRuleError: The edit's Reminders break a Reminder rule.
        RepeatRuleError: The edit's Repeat breaks a Repeat rule, or closes an Occurrence early.
        ArchivedProjectError: The Task is in an archived Project, or would move into one.
        MentionError: A text mentions a Person the user doesn't have.
    """
    task = live_task(user, task_id)
    if task is None:
        return None
    ensure_writable(task.project)
    if edit.project is not None:
        ensure_writable(edit.project)
    before = {name: getattr(task, name) for name in _EDITABLE_FIELDS}
    from_project, from_parent = task.project.name, task.parent_title
    dates_before, repeat_before = TaskDates.of(task), repeat.Repeat.of(task)
    # Closing a repeating Task moves it on instead, and reopening it may undo that.
    step = repeat.plan(task, edit.status)
    _apply(task, replace(edit, status=None, blocked_reason=None) if step else edit)
    repeat.apply_edit(task, edit.repeat_rule, edit.repeat_from, dates_before)
    changed = [name for name in _EDITABLE_FIELDS if getattr(task, name) != before[name]]
    check_mentions(user, *(getattr(task, name) for name in TEXT_FIELDS if name in changed))
    affected = []
    cascaded: list[AffectedTask] = []
    target = edit.project if edit.project and edit.project.pk != task.project_id else None
    with transaction.atomic():
        moved = [] if target is None else move_tree(task, target, _first_position(target))
        if changed or moved:
            task.save(update_fields=[*changed, *moved, "updated_at"])
            sync_mentions(task)
        if "status" in changed:
            affected.append(
                AffectedTask(task.pk, Task.Status(before["status"]), before["blocked_reason"]),
            )
            cascaded = cascade_status(task)
        closed_subtasks = len(cascaded) if task.status in CLOSED_STATUSES else 0
        events = _activity(task, before, dates_before, closed_subtasks)
        if moved:
            events.append(moved_event(task, from_project, from_parent))
        asked = edit.repeat_rule is not None or edit.repeat_from is not None
        events.extend(filter(None, [repeat.edit_event(task, repeat_before, asked=asked)]))
        TaskActivity.objects.bulk_create(events)
        reminders.replace(task, edit.reminders, dates_before)
        if step is not None:
            affected = step.run(task)
    # Re-read, because a change of dates or Status can change whether the Task is overdue.
    fresh = as_rows(user.tasks.filter(pk=task.pk), user).get()
    return TaskChange(task=fresh, affected=affected + cascaded)


def _apply(task: Task, edit: TaskEdit) -> None:
    if edit.title is not None:
        task.title = edit.title
    if edit.description is not None:
        task.description = edit.description
    if edit.priority is not None:
        task.priority = edit.priority
    _apply_status(task, edit)
    if edit.pinned and task.parent_id is not None:
        message = "Only a top-level task can be pinned."
        raise TaskRuleError(message)
    if edit.pinned is not None and edit.pinned != (task.pinned_at is not None):
        task.pinned_at = timezone.now() if edit.pinned else None
    if edit.dates is not None:
        task.due_date, task.due_time = edit.dates.due_date, edit.dates.due_time
        task.start_date, task.start_time = edit.dates.start_date, edit.dates.start_time


def _apply_status(task: Task, edit: TaskEdit) -> None:
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


def _activity(
    task: Task,
    before: dict[str, object],
    dates_before: TaskDates,
    closed_subtasks: int,
) -> list[TaskActivity]:
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
    if (task.pinned_at is None) != (before["pinned_at"] is None):
        kind = TaskActivity.Kind.UNPINNED if task.pinned_at is None else TaskActivity.Kind.PINNED
        events.append(TaskActivity(task=task, kind=kind))
    dates = TaskDates.of(task)
    if dates != dates_before:
        data = {"old": dates_before.as_activity(), "new": dates.as_activity()}
        events.append(TaskActivity(task=task, kind=TaskActivity.Kind.DATES_CHANGED, data=data))
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
