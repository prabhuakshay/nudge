"""Business rules for Projects and Tasks: Inbox, order, Status, pins, dates and Activity.

Every function takes the user first and reaches Projects and Tasks through that user's related
managers, so another user's ids behave as if they don't exist. A change and the Activity event
that records it are saved in one transaction, so a Task's history never misses or invents a change.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from django.db import transaction
from django.db.models import Case, Count, F, OuterRef, Q, Subquery, When
from django.db.models.functions import Coalesce
from django.utils import timezone
from fractional_indexing import generate_key_between

from apps.accounts.services import local_zone
from apps.core.palette import PaletteColor
from apps.tasks.archive import ensure_writable
from apps.tasks.models import (
    CLOSED_STATUSES,
    INBOX_NAME,
    MAX_DEPTH,
    OPEN_STATUSES,
    Attachment,
    Project,
    Task,
    TaskActivity,
)
from apps.tasks.pagination import Page, newest_first

if TYPE_CHECKING:
    from datetime import date, time

    from django.db.models import QuerySet

    from apps.accounts.models import User


class TaskRuleError(Exception):
    """A change that would break a Task rule. The message says which, in the user's words."""


@dataclass(frozen=True)
class TaskDates:
    """A Task's due date, time and range, as clock times in the owner's zone; all None = undated."""

    due_date: date | None = None
    due_time: time | None = None
    start_date: date | None = None
    start_time: time | None = None

    @classmethod
    def of(cls, task: Task) -> TaskDates:
        """Return the Task's current dates."""
        return cls(task.due_date, task.due_time, task.start_date, task.start_time)

    def as_activity(self) -> dict[str, str | None] | None:
        """Return the dates as Activity stores them: ISO strings, or None when undated."""
        if self.due_date is None:
            return None
        return {
            "due_date": self.due_date.isoformat(),
            "due_time": None if self.due_time is None else self.due_time.isoformat("minutes"),
            "start_date": None if self.start_date is None else self.start_date.isoformat(),
            "start_time": None if self.start_time is None else self.start_time.isoformat("minutes"),
        }


@dataclass(frozen=True)
class TaskEdit:
    """The fields of a Task to change; a field left as None stays as it is.

    `dates` replaces all of the Task's dates at once; an empty `TaskDates` removes them.
    """

    title: str | None = None
    description: str | None = None
    status: Task.Status | None = None
    blocked_reason: str | None = None
    priority: Task.Priority | None = None
    pinned: bool | None = None
    dates: TaskDates | None = None
    project: Project | None = None


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


def _with_counts(tasks: QuerySet[Task]) -> QuerySet[Task]:
    # A subquery rather than a join: grouping would drop the model's default ordering.
    attachments = (
        Attachment.objects.filter(task=OuterRef("pk"))
        .order_by()
        .values("task")
        .annotate(count=Count("pk"))
        .values("count")
    )
    return tasks.annotate(attachment_count=Coalesce(Subquery(attachments), 0))


def _with_overdue(tasks: QuerySet[Task], user: User) -> QuerySet[Task]:
    """Annotate each Task with `is_overdue`, judged by the user's clock right now.

    Times are floating, so the comparison is on the user's local date and time: an all-day Task
    is overdue once its day ends, a timed one once its time passes, a range once its end passes.
    """
    now = timezone.now().astimezone(local_zone(user))
    overdue = Q(completed_at__isnull=True) & (
        Q(due_date__lt=now.date()) | Q(due_date=now.date(), due_time__lt=now.time())
    )
    return tasks.annotate(is_overdue=Case(When(overdue, then=True), default=False))


def _as_rows(tasks: QuerySet[Task], user: User) -> QuerySet[Task]:
    """Return the Tasks with everything a list row shows, judged by the user's clock."""
    # Three hops reach a root from the deepest Subtask, so a row's depth costs no queries.
    tasks = tasks.select_related("parent__parent__parent")
    return _with_overdue(_with_counts(tasks), user)


def _live_tasks(project: Project) -> QuerySet[Task]:
    return _as_rows(project.tasks.filter(deleted_at__isnull=True), project.owner)


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
    return Task.objects.filter(below, deleted_at__isnull=True)


def _rows_below(roots: list[Task], user: User) -> list[Task]:
    """Return the live descendants of the roots as list rows."""
    return list(_as_rows(_below(roots), user)) if roots else []


def descendants(task: Task) -> list[Task]:
    """Return every live Subtask below the Task as list rows, in manual order per sibling set."""
    return _rows_below([task], task.owner)


def ancestors(task: Task) -> list[Task]:
    """Return the Tasks above the Task, root first."""
    chain: list[Task] = []
    parent = task.parent
    while parent is not None:
        chain.insert(0, parent)
        parent = parent.parent
    return chain


def open_tasks(project: Project) -> QuerySet[Task]:
    """Return the Project's open trees: open roots and every Subtask under them.

    Pinned roots come first, then the rest in manual order. Subtasks come whatever their Status,
    so a list can show done steps under open work.
    """
    return (
        _live_tasks(project)
        .filter(_root_status_in(OPEN_STATUSES))
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
    rows = [*page.items, *_rows_below(page.items, project.owner)]
    return Page(items=rows, next_cursor=page.next_cursor)


def _first_position(project: Project) -> str:
    """Return a key before every root Task in the Project. Call it inside a transaction."""
    # Locking the Project serialises inserts into it, so two Tasks never get the same key.
    Project.objects.select_for_update().get(pk=project.pk)
    roots = project.tasks.filter(parent__isnull=True).order_by("position", "id")
    first = roots.values_list("position", flat=True).first()
    return str(generate_key_between(None, first))


def create_task(project: Project, title: str) -> Task:
    """Create a Task in the Project, first among its roots, owned by the Project's owner.

    Raises:
        ArchivedProjectError: The Project is archived.
    """
    ensure_writable(project)
    with transaction.atomic():
        task = Task.objects.create(
            owner_id=project.owner_id,
            project=project,
            title=title,
            position=_first_position(project),
        )
        TaskActivity.objects.create(task=task, kind=TaskActivity.Kind.CREATED, at=task.created_at)
    return _with_overdue(project.tasks.all(), project.owner).get(pk=task.pk)


def create_subtask(parent: Task, title: str) -> TaskChange:
    """Create a Subtask last under the parent, in the parent's Project.

    A Closed Task can't hold open work, so adding under one reopens it and its Closed ancestors.

    Raises:
        TaskRuleError: The parent is already at the deepest level.
        ArchivedProjectError: The parent is in an archived Project.
    """
    ensure_writable(parent.project)
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
        affected = _reopen_ancestors(task)
    fresh = _as_rows(Task.objects.filter(pk=task.pk), parent.owner).get()
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
        _reopen_ancestors(task)
    return _as_rows(user.tasks.filter(pk=task.pk), user).get()


def live_task(user: User, task_id: int) -> Task | None:
    """Return one of the user's Tasks that isn't in Trash, or None."""
    tasks = _with_counts(user.tasks.filter(pk=task_id, deleted_at__isnull=True))
    return _with_overdue(tasks, user).first()


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
        ArchivedProjectError: The Task is in an archived Project, or would move into one.
    """
    task = live_task(user, task_id)
    if task is None:
        return None
    ensure_writable(task.project)
    if edit.project is not None:
        ensure_writable(edit.project)
    before = {name: getattr(task, name) for name in _EDITABLE_FIELDS}
    before["project_name"] = task.project.name
    dates_before = TaskDates.of(task)
    _apply(task, edit)
    changed = [name for name in _EDITABLE_FIELDS if getattr(task, name) != before[name]]
    affected = []
    cascaded: list[AffectedTask] = []
    target = edit.project if edit.project and edit.project.pk != task.project_id else None
    with transaction.atomic():
        moved = [] if target is None else _move_to_project(task, target)
        if changed or moved:
            task.save(update_fields=[*changed, *moved, "updated_at"])
        if "status" in changed:
            affected.append(
                AffectedTask(task.pk, Task.Status(before["status"]), before["blocked_reason"]),
            )
            cascaded = _cascade_status(task)
        closed_subtasks = len(cascaded) if task.status in CLOSED_STATUSES else 0
        events = _activity(task, before, dates_before, closed_subtasks)
        if moved:
            events.append(_moved(before["project_name"], task))
        TaskActivity.objects.bulk_create(events)
    # Re-read, because a change of dates or Status can change whether the Task is overdue.
    fresh = _as_rows(user.tasks.filter(pk=task.pk), user).get()
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


def _move_to_project(task: Task, project: Project) -> list[str]:
    """Move the Task and its Subtasks into the Project, first among its roots.

    Returns:
        The Task's fields that changed, for the caller to save.
    """
    _below([task]).update(project=project)
    task.position = _first_position(project)
    task.project = project
    task.parent = None
    return ["project", "position", "parent"]


def _moved(from_project: object, task: Task) -> TaskActivity:
    return TaskActivity(
        task=task,
        kind=TaskActivity.Kind.MOVED,
        data={"from_project": from_project, "to_project": task.project.name},
    )


def task_activity(task: Task, cursor: str | None = None) -> Page[TaskActivity]:
    """Return a page of the Task's history, newest first.

    Raises:
        InvalidCursorError: The cursor wasn't one this function returned.
    """
    return newest_first(task.activity.all(), "at", cursor)


def activity_count(task: Task) -> int:
    """Return how many events the Task's history holds."""
    return task.activity.count()
