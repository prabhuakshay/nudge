"""Adding Tasks: a new root first in its Project, a Subtask last under its parent, or a copy.

Each new Task is saved with its `created` Activity event, its Mentions and its Tags in one
transaction, and an open Task added under Closed work reopens it.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import TYPE_CHECKING

from django.db import transaction
from fractional_indexing import generate_key_between

from apps.tasks import repeat
from apps.tasks.archive import ensure_writable
from apps.tasks.dates import TaskDates
from apps.tasks.mentions import check_mentions, sync_mentions
from apps.tasks.models import MAX_DEPTH, Section, Tag, Task, TaskActivity
from apps.tasks.positions import first_root_position, lock_project
from apps.tasks.repeat import SUBTASK_REPEAT, Repeat, RepeatRuleError
from apps.tasks.rows import as_rows, with_overdue
from apps.tasks.services import TaskChange, TaskRuleError, live_task
from apps.tasks.tags import tags_named
from apps.tasks.tree import reopen_ancestors

if TYPE_CHECKING:
    from collections.abc import Iterable, Sequence

    from apps.accounts.models import User
    from apps.tasks.models import Project


@dataclass(frozen=True)
class NewTask:
    """What a new Task starts with besides its title; all of it is optional.

    `tags` holds Tags, or names of the owner's Tags, which are created if they're new. Only a
    root Task can repeat or be in a Section.
    """

    description: str = ""
    dates: TaskDates = field(default_factory=TaskDates)
    priority: Task.Priority = Task.Priority.NONE
    tags: Sequence[Tag | str] = ()
    repeat: Repeat | None = None
    section: Section | None = None


def create_task(project: Project, title: str, new: NewTask | None = None) -> Task:
    """Create a Task in the Project, first among its roots, owned by the Project's owner.

    Raises:
        ArchivedProjectError: The Project is archived.
        MentionError: The title mentions a Person the owner doesn't have.
        RepeatRuleError: The Repeat's rule is unreadable, or the Task has no due date.
    """
    new = new or NewTask()
    ensure_writable(project)
    check_mentions(project.owner, title)
    with transaction.atomic():
        task = _insert(project, title, new, position=first_root_position(project))
        if new.repeat is not None:
            repeat.start(task, new.repeat.rule, Task.RepeatFrom(new.repeat.repeat_from))
    return with_overdue(project.tasks.all(), project.owner).get(pk=task.pk)


def create_subtask(parent: Task, title: str, new: NewTask | None = None) -> TaskChange:
    """Create a Subtask last under the parent, in the parent's Project.

    A Closed Task can't hold open work, so adding under one reopens it and its Closed ancestors.

    Raises:
        TaskRuleError: The parent is already at the deepest level.
        RepeatRuleError: The Subtask would repeat.
        ArchivedProjectError: The parent is in an archived Project.
        MentionError: The title mentions a Person the owner doesn't have.
    """
    new = new or NewTask()
    ensure_writable(parent.project)
    if parent.depth >= MAX_DEPTH:
        message = "Tasks can only nest four levels deep."
        raise TaskRuleError(message)
    if new.repeat is not None:
        raise RepeatRuleError(SUBTASK_REPEAT)
    check_mentions(parent.owner, title)
    with transaction.atomic():
        lock_project(parent.project_id)
        siblings = parent.subtasks.order_by("-position", "-id")
        last = siblings.values_list("position", flat=True).first()
        position = str(generate_key_between(last, None))
        task = _insert(parent.project, title, new, position=position, parent=parent)
        affected = reopen_ancestors(task)
    fresh = as_rows(Task.objects.filter(pk=task.pk), parent.owner).get()
    return TaskChange(task=fresh, affected=affected)


def duplicate_task(user: User, task_id: int) -> Task | None:
    """Copy one of the user's Tasks to right after it; return None if it isn't theirs.

    The copy is a fresh open Task with the original's title, Description and Priority, under the
    same parent and in the same Section. Being open, it reopens any Closed ancestors.

    Raises:
        ArchivedProjectError: The Task is in an archived Project.
    """
    original = live_task(user, task_id)
    if original is None:
        return None
    ensure_writable(original.project)
    with transaction.atomic():
        lock_project(original.project_id)
        siblings = original.project.tasks.filter(parent_id=original.parent_id)
        later = siblings.filter(position__gt=original.position).order_by("position")
        following = later.values_list("position", flat=True).first()
        task = _insert(
            original.project,
            original.title,
            NewTask(
                description=original.description,
                priority=Task.Priority(original.priority),
                section=original.section,
            ),
            position=str(generate_key_between(original.position, following)),
            parent=original.parent,
        )
        reopen_ancestors(task)
    return as_rows(user.tasks.filter(pk=task.pk), user).get()


def _insert(
    project: Project,
    title: str,
    new: NewTask,
    *,
    position: str,
    parent: Task | None = None,
) -> Task:
    """Save a new Task at the position, with its Activity, Mentions and Tags."""
    task = Task.objects.create(
        owner_id=project.owner_id,
        project=project,
        parent=parent,
        section=new.section,
        title=title,
        description=new.description,
        priority=new.priority,
        position=position,
        **asdict(new.dates),
    )
    TaskActivity.objects.create(task=task, kind=TaskActivity.Kind.CREATED, at=task.created_at)
    sync_mentions(task)
    task.tags.add(*_resolve(project.owner, new.tags))
    return task


def _resolve(user: User, tags: Iterable[Tag | str]) -> list[Tag]:
    """Return the Tags given, with each name turned into the user's Tag of that name."""
    given = list(tags)
    names = [tag for tag in given if isinstance(tag, str)]
    return [*(tag for tag in given if isinstance(tag, Tag)), *tags_named(user, names)]
