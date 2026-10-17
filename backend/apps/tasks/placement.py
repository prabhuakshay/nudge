"""Where a Task sits: its Project, its Section, its parent and its position among its siblings.

This is the only code that changes a Task's place, so its rules hold on every path: adding,
copying, moving, Undo of a bulk move, a change of Project, restoring from Trash and rehoming when
a Project is deleted for good.

- A Task's Section is one of its Project's, and a Task that changes Project leaves it.
- A Subtask never has a Section, a pin or a Repeat; a Task that becomes one drops them.
- A Subtask lives in its root's Project: Subtasks move with their root.
- An archived Project takes no Task in or out. Restoring from Trash is the one exception: a unit
  goes back to its archived Project as it is, because Trash isn't a way to edit one.
- A move the user makes that changes Project, parent or Section is logged as one `moved`
  Activity entry. Restoring from Trash logs `restored` instead, and the purge logs nothing.

Keys come from the target sibling set, which these functions lock, so call the ones that hand
out a place inside a transaction.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from django.db import transaction

from apps.tasks import live, reminders, repeat
from apps.tasks.archive import ensure_writable
from apps.tasks.changes import TaskChange, TaskRuleError
from apps.tasks.models import MAX_DEPTH, Task, TaskActivity
from apps.tasks.rows import as_rows
from apps.tasks.sections import NOT_IN_THIS_PROJECT, SectionRuleError
from apps.tasks.siblings import task_siblings
from apps.tasks.tree import ancestors, below, height, reopen_ancestors

if TYPE_CHECKING:
    from apps.accounts.models import User
    from apps.tasks.models import Project, Section
    from apps.tasks.tree import AffectedTask

TOO_DEEP = "Tasks can only nest four levels deep."


@dataclass(frozen=True)
class Place:
    """Where a Task sits, by ids, which `put_back` restores exactly.

    `parent_id` is None at the top level, `after_id` when it's first among its siblings, and
    `section_id` in No section and for a Subtask.
    """

    id: int
    project_id: int
    parent_id: int | None
    after_id: int | None
    section_id: int | None


def place_of(task: Task) -> Place:
    """Return where the Task sits now."""
    before = task_siblings(task.project_id, task.parent_id).before(task.pk)
    return Place(task.pk, task.project_id, task.parent_id, before, task.section_id)


@dataclass(frozen=True)
class Spot:
    """Where a new Task goes: its Project, parent, Section and key."""

    project: Project
    parent: Task | None
    section: Section | None
    position: str


def root_spot(project: Project, section: Section | None, *, last: bool = False) -> Spot:
    """Return a spot for a new root in the Project's Section: first among its roots, or last.

    Raises:
        ArchivedProjectError: The Project is archived.
        SectionRuleError: The Section is in another Project.
    """
    ensure_writable(project)
    _check_section(project, section)
    roots = task_siblings(project.pk, None)
    return Spot(project, None, section, roots.last() if last else roots.first())


def subtask_spot(parent: Task) -> Spot:
    """Return a spot for a new Subtask last under the parent.

    Raises:
        ArchivedProjectError: The parent is in an archived Project.
        TaskRuleError: The parent is already at the deepest level.
    """
    ensure_writable(parent.project)
    if parent.depth >= MAX_DEPTH:
        raise TaskRuleError(TOO_DEEP)
    return Spot(parent.project, parent, None, task_siblings(parent.project_id, parent.pk).last())


def copy_spot(original: Task) -> Spot:
    """Return a spot right after the original, under the same parent and in the same Section.

    Raises:
        ArchivedProjectError: The original is in an archived Project.
    """
    ensure_writable(original.project)
    siblings = task_siblings(original.project_id, original.parent_id)
    return Spot(original.project, original.parent, original.section, siblings.after(original.pk))


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


def move(user: User, task_id: int, destination: Destination) -> TaskChange:
    """Move one of the user's live Tasks and its Subtasks to the destination.

    A change of Project, parent or Section is logged; a reorder among the same siblings isn't. An
    open Task moved under Closed work reopens it.

    Raises:
        NotFoundError: The Task, or the destination's Project, parent or Section, isn't one of
            the user's.
        TaskRuleError: The destination is under the Task itself, nests too deep, names a
            parent in another Project than the one given, or gives a Subtask a Section.
        SectionRuleError: The Section is in another Project than the destination.
        ArchivedProjectError: The Task is in an archived Project, or would move into one.
    """
    task = live.task(user, task_id)
    to = destination
    given_project = None if to.project_id is None else live.project(user, to.project_id)
    parent = None if to.parent_id is None else live.task(user, to.parent_id)
    given_section = None if to.section_id is None else live.section(user, to.section_id)
    project = _target_project(task, given_project, parent)
    section = _target_section(task, project, parent, given_section, section_given=to.section_given)
    with transaction.atomic():
        _relocate(task, project, parent, section, after_id=to.after_id)
        affected = reopen_ancestors(task)
    fresh = as_rows(Task.objects.filter(pk=task.pk), task.owner).get()
    return TaskChange(task=fresh, affected=affected)


def move_to_project(task: Task, project: Project) -> None:
    """Move the Task and its Subtasks into the Project, as its first root, in No section.

    A Subtask moved on its own becomes a root there, since Subtasks share their root's Project.

    Raises:
        ArchivedProjectError: The Task is in an archived Project, or the Project is archived.
    """
    _relocate(task, project, None, None, after_id=None)


def put_back(user: User, place: Place) -> list[AffectedTask]:
    """Put one of the user's live Tasks back in a place `place_of` gave.

    Returns:
        Every Task whose Status changed, with its Status from before.

    Raises:
        NotFoundError, TaskRuleError, SectionRuleError, ArchivedProjectError: as `move` does.
    """
    destination = Destination(
        place.project_id,
        place.parent_id,
        place.after_id,
        place.section_id,
        section_given=True,
    )
    return move(user, place.id, destination).affected


def return_from_trash(head: Task, unit: list[Task], inbox: Project) -> None:
    """Point a Trash unit back at where its head was, keeping that place when it can.

    The head goes back under its parent if the parent is live and the unit still fits below it,
    else it becomes the last root of its Project, or of the Inbox if the Project is in Trash. A
    root keeps its Section unless it changes Project. An archived Project takes the unit back.
    Every Task of the unit follows the head's Project.
    """
    # No ensure_writable: restoring isn't an edit, so an archived Project takes its unit back.
    unit_height = max(member.depth for member in unit) - head.depth
    parent = head.parent
    if (
        parent is not None
        and parent.deleted_at is None
        and parent.depth + 1 + unit_height <= MAX_DEPTH
    ):
        task_siblings(parent.project_id, parent.pk).lock()
        head.project = parent.project
    else:
        project = head.project if head.project.deleted_at is None else inbox
        roots = task_siblings(project.pk, None)
        if parent is None and project == head.project:
            roots.lock()
        else:
            head.position = roots.last()
        if project != head.project:
            head.section = None
        head.project, head.parent = project, None
    head.save(update_fields=["project", "parent", "section", "position", "updated_at"])
    others = Task.objects.filter(pk__in=[member.pk for member in unit if member != head])
    reminders.update_tasks(others, project=head.project)


def detach(orphan: Task) -> None:
    """Make a Subtask the last root of its Project, so it outlives its parent being deleted."""
    orphan.parent = None
    orphan.position = task_siblings(orphan.project_id, None).last()
    orphan.save(update_fields=["parent", "position", "updated_at"])


def rehome(stray: Task, inbox: Project) -> None:
    """Move a Task out of a Project about to be deleted, into the Inbox, in No section.

    A root becomes the last root of the Inbox; a Subtask keeps its place under its parent, which
    must be rehomed with it.
    """
    if stray.parent_id is None:
        stray.position = task_siblings(inbox.pk, None).last()
    stray.project, stray.section = inbox, None
    stray.save(update_fields=["project", "section", "position", "updated_at"])


def _relocate(
    task: Task,
    project: Project,
    parent: Task | None,
    section: Section | None,
    *,
    after_id: int | None,
) -> None:
    """Put the Task right after `after_id` among the parent's Subtasks or the Project's roots."""
    ensure_writable(task.project)
    ensure_writable(project)
    _check_parent(task, parent)
    _check_section(project, section)
    from_project, from_parent = task.project.name, task.parent_title
    from_section = _section_name(task)
    relocated = (project.pk, _pk(parent), _pk(section)) != (
        task.project_id,
        task.parent_id,
        task.section_id,
    )
    fields = ["project", "parent", "section", "position", "updated_at"]
    events = []
    if parent is not None:
        if task.pinned_at is not None:
            task.pinned_at = None
            events.append(TaskActivity(task=task, kind=TaskActivity.Kind.UNPINNED))
        events.extend(repeat.remove(task))
        fields += ["pinned_at", "repeat_rule", "repeat_anchor", "occurrence_date"]
    if project.pk != task.project_id:
        reminders.update_tasks(below([task]), project=project)
    task.position = task_siblings(project.pk, _pk(parent)).after(after_id, moving=task.pk)
    task.project, task.parent, task.section = project, parent, section
    task.save(update_fields=fields)
    if relocated:
        data = {
            "from_project": from_project,
            "to_project": project.name,
            "from_parent": from_parent,
            "to_parent": task.parent_title,
            "from_section": from_section,
            "to_section": _section_name(task),
        }
        events.append(TaskActivity(task=task, kind=TaskActivity.Kind.MOVED, data=data))
    TaskActivity.objects.bulk_create(events)


def _pk(row: Task | Section | None) -> int | None:
    return None if row is None else row.pk


def _section_name(task: Task) -> str | None:
    """Return the name of the Task's Section, which Activity records; None for No section."""
    return None if task.section is None else task.section.name


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
    return section


def _check_section(project: Project, section: Section | None) -> None:
    if section is not None and section.project_id != project.pk:
        raise SectionRuleError(NOT_IN_THIS_PROJECT)


def _check_parent(task: Task, parent: Task | None) -> None:
    if parent is None:
        return
    if parent.pk == task.pk or task.pk in {above.pk for above in ancestors(parent)}:
        message = "A task can't go under itself or one of its subtasks."
        raise TaskRuleError(message)
    if parent.depth + 1 + height(task) > MAX_DEPTH:
        raise TaskRuleError(TOO_DEEP)
