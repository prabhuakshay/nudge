"""Task endpoints: list Tasks; add, read, change, move, copy or delete one."""

from __future__ import annotations

from dataclasses import replace
from datetime import timedelta
from http import HTTPStatus
from typing import TYPE_CHECKING

from ninja import Query, Router, Status

from apps.core.auth import signed_in_user
from apps.core.schemas import ErrorOut
from apps.tasks import creation, moves, sections, services, tags, trash, tree
from apps.tasks.api import list_sources
from apps.tasks.api.errors import (
    PROJECT_NOT_FOUND,
    SECTION_NOT_FOUND,
    TAG_NOT_FOUND,
    TASK_NOT_FOUND,
)
from apps.tasks.dates import TaskDates
from apps.tasks.models import Task
from apps.tasks.repeat import Repeat
from apps.tasks.schemas.reminders import ReminderOut
from apps.tasks.schemas.tasks import (
    AffectedTaskOut,
    TaskAncestorOut,
    TaskChangeOut,
    TaskDetailOut,
    TaskIn,
    TaskListOut,
    TaskListQuery,
    TaskMoveIn,
    TaskOut,
    TaskPatchIn,
)

if TYPE_CHECKING:
    from django.http import HttpRequest

    from apps.accounts.models import User
    from apps.tasks.models import Section, Tag

router = Router()


@router.get(
    "",
    response={
        HTTPStatus.OK: TaskListOut,
        HTTPStatus.NOT_FOUND: ErrorOut,
        HTTPStatus.UNPROCESSABLE_ENTITY: ErrorOut,
    },
    summary="List a Project's, a Person's, a Tag's or a view's Tasks",
)
def list_tasks(
    request: HttpRequest,
    query: Query[TaskListQuery],
) -> Status[TaskListOut] | Status[ErrorOut]:
    """Return the open Tasks of a Project, Person, Tag or view, or, with `closed`, Closed ones.

    A Project's Tasks come in manual order. A Person's are the Tasks that mention them and a
    Tag's the Tasks it's on, flat, in each Project's manual order. Today, Upcoming and All list
    flat rows by date, with Overdue first and, in All, undated Tasks last; Today's Closed Tasks
    are those closed today, and Upcoming and All have none. Closed Tasks come most recently
    completed first, in pages; open Tasks come all at once. A Project's list can be narrowed to
    one of its Sections, or to No section, as a Board column shows it.
    """
    source = list_sources.list_source(signed_in_user(request), query)
    if isinstance(source, Status):
        return source
    open_tasks, closed_page = source
    if not query.closed:
        items = [TaskOut.from_orm(task) for task in open_tasks()]
        return Status(HTTPStatus.OK, TaskListOut(items=items, next_cursor=None))
    page = closed_page(query.cursor)
    items = [TaskOut.from_orm(task) for task in page.items]
    return Status(HTTPStatus.OK, TaskListOut(items=items, next_cursor=page.next_cursor))


@router.post(
    "",
    response={
        HTTPStatus.CREATED: TaskOut,
        HTTPStatus.NOT_FOUND: ErrorOut,
        HTTPStatus.UNPROCESSABLE_ENTITY: ErrorOut,
    },
    summary="Add a Task",
)
def create_task(request: HttpRequest, task: TaskIn) -> Status[TaskOut] | Status[ErrorOut]:
    """Add a Task first in its Project, or in the Inbox when no Project is given.

    With `parent_id` it is added last under that Task instead, which reopens the parent and its
    ancestors if they are Closed. Tags named in `tags` that the user doesn't have yet are
    created with the Task. A dated top-level Task can repeat from the start.
    """
    user = signed_in_user(request)
    picked = tags.owned_tags(user, task.tag_ids)
    if picked is None:
        return Status(HTTPStatus.NOT_FOUND, TAG_NOT_FOUND)
    section = None if task.section_id is None else sections.section(user, task.section_id)
    if task.section_id is not None and section is None:
        return Status(HTTPStatus.NOT_FOUND, SECTION_NOT_FOUND)
    if task.parent_id is not None:
        return _create_subtask(user, task.parent_id, task, [*picked, *task.tags])
    return _create_root(user, task, section, [*picked, *task.tags])


def _create_root(
    user: User,
    task: TaskIn,
    section: Section | None,
    with_tags: list[Tag | str],
) -> Status[TaskOut] | Status[ErrorOut]:
    project = (
        services.inbox(user)
        if task.project_id is None
        else services.live_project(user, task.project_id)
    )
    if project is None:
        return Status(HTTPStatus.NOT_FOUND, PROJECT_NOT_FOUND)
    new = replace(_new_task(task, with_tags), section=section)
    created = creation.create_task(project, task.title, new)
    return Status(HTTPStatus.CREATED, TaskOut.from_orm(created))


def _create_subtask(
    user: User,
    parent_id: int,
    task: TaskIn,
    with_tags: list[Tag | str],
) -> Status[TaskOut] | Status[ErrorOut]:
    parent = services.live_task(user, parent_id)
    if parent is None:
        return Status(HTTPStatus.NOT_FOUND, TASK_NOT_FOUND)
    change = creation.create_subtask(parent, task.title, _new_task(task, with_tags))
    return Status(HTTPStatus.CREATED, TaskOut.from_orm(change.task))


def _new_task(task: TaskIn, with_tags: list[Tag | str]) -> creation.NewTask:
    """Return what the new Task starts with besides its title."""
    return creation.NewTask(
        dates=_dates(task) or TaskDates(),
        priority=task.priority or Task.Priority.NONE,
        tags=with_tags,
        repeat=_repeat(task),
    )


def _detail(task: Task) -> TaskDetailOut:
    """Return the Task as the drawer shows it: its fields, its ancestors and its Subtasks."""
    return TaskDetailOut(
        **TaskOut.from_orm(task).model_dump(),
        description=task.description,
        ancestors=[
            TaskAncestorOut(id=above.pk, title=above.title) for above in tree.ancestors(task)
        ],
        subtasks=[TaskOut.from_orm(below) for below in tree.descendants(task)],
        reminders=[ReminderOut.of(reminder) for reminder in task.reminders.all()],
    )


def task_change_out(change: services.TaskChange) -> TaskChangeOut:
    """Return a change as the API shows it, with every Task whose Status changed, for Undo."""
    affected = [AffectedTaskOut.from_orm(task) for task in change.affected]
    return TaskChangeOut(task=_detail(change.task), affected=affected)


@router.get(
    "/{int:task_id}",
    response={HTTPStatus.OK: TaskDetailOut, HTTPStatus.NOT_FOUND: ErrorOut},
    summary="Get a Task",
)
def get_task(request: HttpRequest, task_id: int) -> Status[TaskDetailOut] | Status[ErrorOut]:
    """Return a Task with everything the detail drawer shows."""
    task = services.live_task(signed_in_user(request), task_id)
    if task is None:
        return Status(HTTPStatus.NOT_FOUND, TASK_NOT_FOUND)
    return Status(HTTPStatus.OK, _detail(task))


@router.patch(
    "/{int:task_id}",
    response={
        HTTPStatus.OK: TaskChangeOut,
        HTTPStatus.NOT_FOUND: ErrorOut,
        HTTPStatus.UNPROCESSABLE_ENTITY: ErrorOut,
    },
    summary="Change a Task",
)
def update_task(
    request: HttpRequest,
    task_id: int,
    patch: TaskPatchIn,
) -> Status[TaskChangeOut] | Status[ErrorOut]:
    """Change a Task's fields, returning it and every Task whose Status changed.

    Each changed Task comes with its Status and Blocked reason from before, so the client can
    offer Undo without the server keeping anything.
    """
    user = signed_in_user(request)
    edit = _edit(user, patch)
    if isinstance(edit, Status):
        return edit
    change = services.update_task(user, task_id, edit)
    if change is None:
        return Status(HTTPStatus.NOT_FOUND, TASK_NOT_FOUND)
    return Status(HTTPStatus.OK, task_change_out(change))


@router.delete(
    "/{int:task_id}",
    response={
        HTTPStatus.NO_CONTENT: None,
        HTTPStatus.NOT_FOUND: ErrorOut,
        HTTPStatus.UNPROCESSABLE_ENTITY: ErrorOut,
    },
    summary="Move a Task to Trash",
)
def delete_task(request: HttpRequest, task_id: int) -> Status[None] | Status[ErrorOut]:
    """Send a Task and its Subtasks to Trash as one unit, which `restore` brings back."""
    trashed = trash.trash_task(signed_in_user(request), task_id)
    if not trashed:
        return Status(HTTPStatus.NOT_FOUND, TASK_NOT_FOUND)
    return Status(HTTPStatus.NO_CONTENT, None)


@router.post(
    "/{int:task_id}/move",
    response={
        HTTPStatus.OK: TaskChangeOut,
        HTTPStatus.NOT_FOUND: ErrorOut,
        HTTPStatus.UNPROCESSABLE_ENTITY: ErrorOut,
    },
    summary="Move a Task",
)
def move_task(
    request: HttpRequest,
    task_id: int,
    move: TaskMoveIn,
) -> Status[TaskChangeOut] | Status[ErrorOut]:
    """Move a Task and its Subtasks under a parent, or to a Project's top level, after a sibling.

    The server picks the new order key. The Task comes back with every Closed ancestor the move
    reopened, so the client can offer Undo.
    """
    user = signed_in_user(request)
    task = services.live_task(user, task_id)
    destination = _destination(user, move)
    if task is None:
        return Status(HTTPStatus.NOT_FOUND, TASK_NOT_FOUND)
    if isinstance(destination, ErrorOut):
        return Status(HTTPStatus.NOT_FOUND, destination)
    change = moves.move_task(task, destination)
    return Status(HTTPStatus.OK, task_change_out(change))


def _destination(user: User, move: TaskMoveIn) -> moves.Destination | ErrorOut:
    """Resolve the move's ids to the user's Project, parent and Section, or say which is missing."""
    project = parent = section = None
    if move.project_id is not None:
        project = services.live_project(user, move.project_id)
        if project is None:
            return PROJECT_NOT_FOUND
    if move.parent_id is not None:
        parent = services.live_task(user, move.parent_id)
        if parent is None:
            return TASK_NOT_FOUND
    if move.section_id is not None:
        section = sections.section(user, move.section_id)
        if section is None:
            return SECTION_NOT_FOUND
    return moves.Destination(
        project,
        parent,
        move.after_id,
        section=section,
        section_given="section_id" in move.model_fields_set,
    )


@router.post(
    "/{int:task_id}/duplicate",
    response={
        HTTPStatus.CREATED: TaskOut,
        HTTPStatus.NOT_FOUND: ErrorOut,
        HTTPStatus.UNPROCESSABLE_ENTITY: ErrorOut,
    },
    summary="Duplicate a Task",
)
def duplicate_task(request: HttpRequest, task_id: int) -> Status[TaskOut] | Status[ErrorOut]:
    """Add an open copy of a Task right after it, with its title, Description and Priority."""
    copy = creation.duplicate_task(signed_in_user(request), task_id)
    if copy is None:
        return Status(HTTPStatus.NOT_FOUND, TASK_NOT_FOUND)
    return Status(HTTPStatus.CREATED, TaskOut.from_orm(copy))


def _edit(
    user: User,
    patch: TaskPatchIn,
) -> services.TaskEdit | Status[ErrorOut]:
    """Return the edit the patch asks for, or a 404 for another user's Project or Tag."""
    project = None
    if patch.project_id is not None:
        project = services.live_project(user, patch.project_id)
        if project is None:
            return Status(HTTPStatus.NOT_FOUND, PROJECT_NOT_FOUND)
    picked = None if patch.tag_ids is None else tags.owned_tags(user, patch.tag_ids)
    if patch.tag_ids is not None and picked is None:
        return Status(HTTPStatus.NOT_FOUND, TAG_NOT_FOUND)
    return services.TaskEdit(
        title=patch.title,
        description=patch.description,
        status=patch.status,
        blocked_reason=patch.blocked_reason,
        priority=patch.priority,
        pinned=patch.pinned,
        dates=_dates(patch),
        reminders=None
        if patch.reminders is None
        else [timedelta(minutes=offset) for offset in patch.reminders],
        project=project,
        repeat_rule=patch.repeat_rule,
        repeat_from=patch.repeat_from,
        tags=picked,
        move_occurrence=bool(patch.move_occurrence),
    )


def _repeat(task: TaskIn) -> Repeat | None:
    """Return the Repeat a new Task asks for, or None when it doesn't repeat."""
    if not task.repeat_rule:
        return None
    return Repeat(task.repeat_rule, task.repeat_from or Task.RepeatFrom.CALENDAR)


def _dates(body: TaskIn | TaskPatchIn) -> TaskDates | None:
    """Return the dates the input sets, an empty set when it clears them, or None if neither."""
    if "dates" not in body.model_fields_set:
        return None
    if body.dates is None:
        return TaskDates()
    dates = body.dates
    return TaskDates(dates.due_date, dates.due_time, dates.start_date, dates.start_time)
