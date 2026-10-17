"""Adding Tasks: a new root first in its Project, a Subtask last under its parent, or a copy.

Each new Task is saved with its `created` Activity event, its Mentions and its Tags in one
transaction, and an open Task added under Closed work reopens it.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field, replace
from typing import TYPE_CHECKING

from django.db import transaction

from apps.tasks import live, repeat
from apps.tasks.archive import ensure_writable
from apps.tasks.changes import TaskChange, TaskRuleError
from apps.tasks.dates import TaskDates
from apps.tasks.mentions import check_mentions, sync_mentions
from apps.tasks.models import MAX_DEPTH, Tag, Task, TaskActivity
from apps.tasks.repeat import SUBTASK_REPEAT, Repeat, RepeatRuleError
from apps.tasks.rows import as_rows, with_overdue
from apps.tasks.sections import NOT_IN_THIS_PROJECT, SectionRuleError
from apps.tasks.services import inbox
from apps.tasks.siblings import task_siblings
from apps.tasks.tags import owned_tags, tags_named
from apps.tasks.tree import reopen_ancestors

if TYPE_CHECKING:
    from collections.abc import Iterable, Sequence

    from apps.accounts.models import User
    from apps.tasks.models import Project, Section


@dataclass(frozen=True)
class NewTask:
    """What a new Task starts with besides its title; all of it is optional.

    `tags` holds Tags, or names of the owner's Tags, which are created if they're new. Only a
    root Task can repeat or sit in a Section. `last` adds a root Task after its Project's other
    roots rather than before them.
    """

    description: str = ""
    dates: TaskDates = field(default_factory=TaskDates)
    priority: Task.Priority = Task.Priority.NONE
    tags: Sequence[Tag | str] = ()
    repeat: Repeat | None = None
    section: Section | None = None
    last: bool = False


@dataclass(frozen=True)
class Placement:
    """Where a request asks for a new Task, by ids: under a parent, else in a Project or the Inbox.

    A Subtask follows its root's Section, so the Section given for one only has to be the user's.
    """

    project_id: int | None = None
    parent_id: int | None = None
    section_id: int | None = None


def add_task(
    user: User,
    title: str,
    new: NewTask,
    placement: Placement,
    tag_ids: Iterable[int] = (),
) -> Task:
    """Add a Task for the user where the placement says, with the Tags `tag_ids` names as well.

    Raises:
        NotFoundError: The Project, parent, Section or a Tag isn't one of the user's.
        ArchivedProjectError, MentionError, RepeatRuleError, SectionRuleError, TaskRuleError: As
            `create_task` and `create_subtask` do.
    """
    new = replace(new, tags=[*owned_tags(user, tag_ids), *new.tags])
    section = None if placement.section_id is None else live.section(user, placement.section_id)
    if placement.parent_id is not None:
        return create_subtask(live.task(user, placement.parent_id), title, new).task
    project = (
        inbox(user) if placement.project_id is None else live.project(user, placement.project_id)
    )
    return create_task(project, title, replace(new, section=section))


def create_task(project: Project, title: str, new: NewTask | None = None) -> Task:
    """Create a Task in the Project, owned by the Project's owner.

    It goes first among the Project's roots, or last when `new.last` is set.

    Raises:
        ArchivedProjectError: The Project is archived.
        MentionError: The title mentions a Person the owner doesn't have.
        RepeatRuleError: The Repeat's rule is unreadable, or the Task has no due date.
        SectionRuleError: The Section is in another Project.
    """
    new = new or NewTask()
    ensure_writable(project)
    if new.section is not None and new.section.project_id != project.pk:
        raise SectionRuleError(NOT_IN_THIS_PROJECT)
    check_mentions(project.owner, title)
    with transaction.atomic():
        roots = task_siblings(project.pk, None)
        position = roots.last() if new.last else roots.first()
        task = _insert(project, title, new, position=position)
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
        position = task_siblings(parent.project_id, parent.pk).last()
        task = _insert(parent.project, title, new, position=position, parent=parent)
        affected = reopen_ancestors(task)
    fresh = as_rows(Task.objects.filter(pk=task.pk), parent.owner).get()
    return TaskChange(task=fresh, affected=affected)


def duplicate_task(user: User, task_id: int) -> Task:
    """Copy one of the user's live Tasks to right after it.

    The copy is a fresh open Task with the original's title, Description and Priority, under the
    same parent and in the same Section. Being open, it reopens any Closed ancestors.

    Raises:
        NotFoundError: The Task isn't one of the user's.
        ArchivedProjectError: The Task is in an archived Project.
    """
    original = live.task(user, task_id)
    ensure_writable(original.project)
    with transaction.atomic():
        siblings = task_siblings(original.project_id, original.parent_id)
        position = siblings.after(original.pk)
        task = _insert(
            original.project,
            original.title,
            NewTask(
                description=original.description,
                priority=Task.Priority(original.priority),
                section=original.section,
            ),
            position=position,
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
