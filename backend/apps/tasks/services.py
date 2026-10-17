"""Business rules for Projects and Tasks: Inbox, order, Status, pins, dates and Activity.

Every function takes the user first and turns ids into that user's live rows through
`apps.tasks.live`, so another user's ids behave as if they don't exist. A change and the Activity
event that records it are saved in one transaction, so a Task's history never misses or invents a
change.
How a change spreads through a Task's Subtask tree lives in `apps.tasks.tree`.
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from typing import TYPE_CHECKING

from django.db import transaction
from django.db.models import F, Q
from django.utils import timezone

from apps.core.palette import PaletteColor
from apps.tasks import live, placement, reminders, repeat
from apps.tasks.archive import ensure_writable
from apps.tasks.changes import TaskChange, TaskRuleError
from apps.tasks.dates import TaskDates
from apps.tasks.mentions import TEXT_FIELDS, check_mentions, sync_mentions
from apps.tasks.models import (
    CLOSED_STATUSES,
    INBOX_NAME,
    OPEN_STATUSES,
    Project,
    Task,
    TaskActivity,
)
from apps.tasks.pagination import Page, newest_first
from apps.tasks.rows import as_rows
from apps.tasks.tags import owned_tags, retag
from apps.tasks.tree import (
    AffectedTask,
    cascade_status,
    root_in_section,
    root_status_in,
    rows_below,
)

if TYPE_CHECKING:
    from datetime import timedelta

    from django.db.models import QuerySet

    from apps.accounts.models import User
    from apps.tasks.models import Section


@dataclass(frozen=True)
class TaskEdit:
    """The fields of a Task to change; a field left as None stays as it is.

    `dates` replaces all of the Task's dates at once; an empty `TaskDates` removes them, and the
    Reminders with them. `reminders` replaces the Reminders, as offsets, and `tag_ids` the Tags.
    `project_id` moves the Task to another Project.
    New dates restart a repeating Task's series there, unless `move_occurrence` says they move
    only its current Occurrence.
    """

    title: str | None = None
    description: str | None = None
    status: Task.Status | None = None
    blocked_reason: str | None = None
    priority: Task.Priority | None = None
    pinned: bool | None = None
    dates: TaskDates | None = None
    reminders: list[timedelta] | None = None
    project_id: int | None = None
    repeat_rule: str | None = None
    repeat_from: Task.RepeatFrom | None = None
    tag_ids: list[int] | None = None
    move_occurrence: bool = False


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


def _project_rows(project: Project) -> QuerySet[Task]:
    return as_rows(live.tasks(project.owner).filter(project=project), project.owner)


def open_tasks(project: Project) -> QuerySet[Task]:
    """Return the Project's open trees: open roots and every Subtask under them.

    Pinned roots come first, then the rest in manual order. Subtasks come whatever their Status,
    so a list can show done steps under open work.
    """
    return _open_trees(project, Q())


def section_open_tasks(project: Project, section: Section | None) -> QuerySet[Task]:
    """Return the Project's open trees in the Section, or in No section for None.

    They come as in `open_tasks`.
    """
    return _open_trees(project, root_in_section(section))


def _open_trees(project: Project, trees: Q) -> QuerySet[Task]:
    return (
        _project_rows(project)
        .filter(root_status_in(OPEN_STATUSES), trees)
        .order_by(F("pinned_at").asc(nulls_last=True), "position", "id")
    )


def closed_tasks(project: Project, cursor: str | None = None) -> Page[Task]:
    """Return a page of the Project's Closed trees, most recently completed root first.

    Each page holds its Closed roots, newest first, then every Subtask under them in manual
    order. A Closed root has no open descendants, so the whole tree is Closed.

    Raises:
        InvalidCursorError: The cursor wasn't one this function returned.
    """
    return _closed_trees(project, Q(), cursor)


def section_closed_tasks(
    project: Project,
    section: Section | None,
    cursor: str | None = None,
) -> Page[Task]:
    """Return a page of the Project's Closed trees in the Section, or in No section for None.

    Pages come as in `closed_tasks`.

    Raises:
        InvalidCursorError: The cursor wasn't one this function returned.
    """
    return _closed_trees(project, root_in_section(section), cursor)


def _closed_trees(project: Project, trees: Q, cursor: str | None) -> Page[Task]:
    roots = _project_rows(project).filter(trees, parent__isnull=True, status__in=CLOSED_STATUSES)
    page = newest_first(roots, "completed_at", cursor)
    rows = [*page.items, *rows_below(page.items, project.owner)]
    return Page(items=rows, next_cursor=page.next_cursor)


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
    "occurrence_date",
    "repeat_from",
)


def update_task(user: User, task_id: int, edit: TaskEdit) -> TaskChange:
    """Change the given fields of one of the user's live Tasks.

    A Status change keeps the tree consistent: closing a Task closes its open descendants with
    the same Status, and reopening one reopens its Closed ancestors. Every Task the change
    touched comes back in `affected`.

    Moving it to another of the user's Projects puts it first among the roots there, with its
    Subtasks under it; a Subtask moved out becomes a root, since Subtasks share their root's
    Project. Each Tag put on or taken off is logged in Activity.

    Raises:
        NotFoundError: The Task, the Project or a Tag isn't one of the user's.
        TaskRuleError: The edit gives a Blocked reason to a Task that isn't Blocked, or pins a
            Subtask.
        ReminderRuleError: The edit's Reminders break a Reminder rule.
        RepeatRuleError: The edit's Repeat breaks a Repeat rule, or closes an Occurrence early.
        ArchivedProjectError: The Task is in an archived Project, or would move into one.
        MentionError: A text mentions a Person the user doesn't have.
    """
    task = live.task(user, task_id)
    target = _target_project(user, task, edit.project_id)
    tags = None if edit.tag_ids is None else owned_tags(user, edit.tag_ids)
    ensure_writable(task.project)
    before = {name: getattr(task, name) for name in _EDITABLE_FIELDS}
    dates_before, repeat_before = TaskDates.of(task), repeat.Repeat.of(task)
    # Closing a repeating Task moves it on instead, and reopening it may undo that.
    step = repeat.plan(task, edit.status)
    _apply(task, replace(edit, status=None, blocked_reason=None) if step else edit)
    repeat.apply_edit(
        task,
        edit.repeat_rule,
        edit.repeat_from,
        dates_before,
        move_occurrence=edit.move_occurrence,
    )
    changed = [name for name in _EDITABLE_FIELDS if getattr(task, name) != before[name]]
    check_mentions(user, *(getattr(task, name) for name in TEXT_FIELDS if name in changed))
    affected = []
    cascaded: list[AffectedTask] = []
    with transaction.atomic():
        if target is not None:
            placement.move_to_project(task, target)
        if changed:
            task.save(update_fields=[*changed, "updated_at"])
            sync_mentions(task)
        if "status" in changed:
            affected.append(
                AffectedTask(task.pk, Task.Status(before["status"]), before["blocked_reason"]),
            )
            cascaded = cascade_status(task)
        closed_subtasks = len(cascaded) if task.status in CLOSED_STATUSES else 0
        events = _activity(task, before, dates_before, closed_subtasks)
        asked = edit.repeat_rule is not None or edit.repeat_from is not None
        events.extend(filter(None, [repeat.edit_event(task, repeat_before, asked=asked)]))
        events.extend([] if tags is None else retag(task, tags))
        TaskActivity.objects.bulk_create(events)
        reminders.replace(task, edit.reminders, dates_before)
        if step is not None:
            affected = step.run(task)
    # Re-read, because a change of dates or Status can change whether the Task is overdue.
    fresh = as_rows(user.tasks.filter(pk=task.pk), user).get()
    return TaskChange(task=fresh, affected=affected + cascaded)


def _target_project(user: User, task: Task, project_id: int | None) -> Project | None:
    """Return the user's live Project the Task moves to, or None when it stays in its own."""
    if project_id is None:
        return None
    project = live.project(user, project_id)
    return None if project.pk == task.project_id else project


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


@dataclass(frozen=True)
class ActivityPage:
    """A page of a Task's history, and how many events the whole history holds."""

    items: list[TaskActivity]
    next_cursor: str | None
    count: int


def task_activity(user: User, task_id: int, cursor: str | None = None) -> ActivityPage:
    """Return a page of the history of one of the user's live Tasks, newest first.

    Raises:
        NotFoundError: The Task isn't one of the user's.
        InvalidCursorError: The cursor wasn't one this function returned.
    """
    task = live.task(user, task_id)
    page = newest_first(task.activity.all(), "at", cursor)
    return ActivityPage(page.items, page.next_cursor, task.activity.count())
