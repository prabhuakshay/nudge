"""Moving a Task within its tree, into another tree or to another Project.

The client says where a Task goes by its new parent and the sibling it now follows, never by a
key. The server generates the key while holding a lock on the target Project, so two moves into
one sibling set never get the same key. A Task carries its Subtasks wherever it goes, and the move
writes one row for it plus, across Projects, the Project of each Subtask.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from django.db import transaction

from apps.tasks import live, repeat
from apps.tasks.archive import ensure_writable
from apps.tasks.changes import TaskChange, TaskRuleError
from apps.tasks.models import MAX_DEPTH, Project, Section, Task, TaskActivity
from apps.tasks.rows import as_rows
from apps.tasks.sections import NOT_IN_THIS_PROJECT, SectionRuleError
from apps.tasks.siblings import task_siblings
from apps.tasks.tree import (
    ancestors,
    height,
    move_descendants,
    moved_event,
    reopen_ancestors,
    section_name,
)

if TYPE_CHECKING:
    from apps.accounts.models import User


@dataclass(frozen=True)
class Destination:
    """Where a Task goes, by the ids of the owner's Project, parent, sibling and Section.

    No `project_id` means the parent's Project, or the Task's own for a root. No `parent_id`
    means the top level. No `after_id` puts it first among its new siblings; an `after_id` that
    isn't one of them puts it last. `section_id` is the Section a root joins, or No section, and
    counts only when `section_given`; otherwise a root staying in its Project keeps its Section.
    """

    project_id: int | None = None
    parent_id: int | None = None
    after_id: int | None = None
    section_id: int | None = None
    section_given: bool = False


def move_task(user: User, task_id: int, destination: Destination) -> TaskChange:
    """Move one of the user's live Tasks and its Subtasks to the destination.

    A change of Project, parent or Section is logged; a reorder among the same siblings isn't. A
    Task that becomes a Subtask drops its pin, its Repeat and its Section, since only roots have
    them, and an open Task moved under Closed work reopens it.

    Raises:
        NotFoundError: The Task, or the destination's Project, parent or Section, isn't one of
            the user's.
        TaskRuleError: The destination is under the Task itself, nests too deep, names a
            parent in another Project than the one given, or gives a Subtask a Section.
        SectionRuleError: The Section is in another Project than the destination.
        ArchivedProjectError: The Task is in an archived Project, or would move into one.
    """
    task = live.task(user, task_id)
    given_project, parent, given_section = _resolve(user, destination)
    project = _target_project(task, given_project, parent)
    ensure_writable(task.project)
    ensure_writable(project)
    _check_parent(task, parent)
    section = _target_section(
        task, project, parent, given_section, section_given=destination.section_given
    )
    from_project, from_parent = task.project.name, task.parent_title
    from_section = section_name(task)
    with transaction.atomic():
        siblings = task_siblings(project.pk, _pk(parent))
        position = siblings.after(destination.after_id, moving=task.pk)
        events = []
        if parent is not None and task.pinned_at is not None:
            task.pinned_at = None
            events.append(TaskActivity(task=task, kind=TaskActivity.Kind.UNPINNED))
        if parent is not None:
            events.extend(repeat.remove(task))
        if project.pk != task.project_id:
            move_descendants(task, project)
        relocated = (
            project.pk != task.project_id
            or task.parent_id != _pk(parent)
            or task.section_id != _pk(section)
        )
        task.position = position
        task.project, task.parent, task.section = project, parent, section
        task.save(
            update_fields=[
                "project",
                "parent",
                "section",
                "position",
                "pinned_at",
                "repeat_rule",
                "repeat_anchor",
                "occurrence_date",
                "updated_at",
            ],
        )
        if relocated:
            events.append(moved_event(task, from_project, from_parent, from_section))
        TaskActivity.objects.bulk_create(events)
        affected = reopen_ancestors(task)
    fresh = as_rows(Task.objects.filter(pk=task.pk), task.owner).get()
    return TaskChange(task=fresh, affected=affected)


def _pk(row: Task | Section | None) -> int | None:
    return None if row is None else row.pk


def _resolve(user: User, to: Destination) -> tuple[Project | None, Task | None, Section | None]:
    """Return the user's live Project, parent and Section the destination names, where it does."""
    project = None if to.project_id is None else live.project(user, to.project_id)
    parent = None if to.parent_id is None else live.task(user, to.parent_id)
    section = None if to.section_id is None else live.section(user, to.section_id)
    return project, parent, section


def _target_project(task: Task, project: Project | None, parent: Task | None) -> Project:
    if parent is None:
        return project or task.project
    if project is not None and project.pk != parent.project_id:
        message = "A subtask lives in its parent's project."
        raise TaskRuleError(message)
    return parent.project


def _target_section(
    task: Task,
    project: Project,
    parent: Task | None,
    section: Section | None,
    *,
    section_given: bool,
) -> Section | None:
    """Return the Section the Task has after the move: Subtasks follow their root's."""
    if parent is not None:
        if section is not None:
            message = "A Subtask follows its root Task's Section."
            raise TaskRuleError(message)
        return None
    if not section_given:
        return task.section if project.pk == task.project_id else None
    if section is not None and section.project_id != project.pk:
        raise SectionRuleError(NOT_IN_THIS_PROJECT)
    return section


def _check_parent(task: Task, parent: Task | None) -> None:
    if parent is None:
        return
    if parent.pk == task.pk or task.pk in {above.pk for above in ancestors(parent)}:
        message = "A task can't go under itself or one of its subtasks."
        raise TaskRuleError(message)
    if parent.depth + 1 + height(task) > MAX_DEPTH:
        message = "Tasks can only nest four levels deep."
        raise TaskRuleError(message)
