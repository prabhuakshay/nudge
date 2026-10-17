"""Task endpoints: list Tasks; add, read, change, move, copy or delete one."""

from __future__ import annotations

from datetime import timedelta
from http import HTTPStatus
from typing import TYPE_CHECKING

from ninja import Query, Router, Status

from apps.core.auth import signed_in_user
from apps.core.schemas import ErrorOut
from apps.tasks import creation, live, placement, services, trash, tree
from apps.tasks.api import list_sources
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

    from apps.tasks.changes import TaskChange

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
def create_task(request: HttpRequest, task: TaskIn) -> Status[TaskOut]:
    """Add a Task first in its Project, or in the Inbox when no Project is given.

    With `last` it goes last among the Project's top-level Tasks instead. With `parent_id` it is
    added last under that Task, which reopens the parent and its ancestors if they are Closed.
    Tags named in `tags` that the user doesn't have yet are created with the Task. A dated
    top-level Task can repeat from the start.
    """
    new = creation.NewTask(
        dates=_dates(task) or TaskDates(),
        priority=task.priority or Task.Priority.NONE,
        tags=task.tags,
        repeat=_repeat(task),
        last=bool(task.last),
    )
    asked = creation.Asked(task.project_id, task.parent_id, task.section_id)
    created = creation.add_task(signed_in_user(request), task.title, new, asked, task.tag_ids)
    return Status(HTTPStatus.CREATED, TaskOut.from_orm(created))


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


def task_change_out(change: TaskChange) -> TaskChangeOut:
    """Return a change as the API shows it, with every Task whose Status changed, for Undo."""
    affected = [AffectedTaskOut.from_orm(task) for task in change.affected]
    return TaskChangeOut(task=_detail(change.task), affected=affected)


@router.get(
    "/{int:task_id}",
    response={HTTPStatus.OK: TaskDetailOut, HTTPStatus.NOT_FOUND: ErrorOut},
    summary="Get a Task",
)
def get_task(request: HttpRequest, task_id: int) -> Status[TaskDetailOut]:
    """Return a Task with everything the detail drawer shows."""
    task = live.task(signed_in_user(request), task_id)
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
) -> Status[TaskChangeOut]:
    """Change a Task's fields, returning it and every Task whose Status changed.

    Each changed Task comes with its Status and Blocked reason from before, so the client can
    offer Undo without the server keeping anything.
    """
    change = services.update_task(signed_in_user(request), task_id, _edit(patch))
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
def delete_task(request: HttpRequest, task_id: int) -> Status[None]:
    """Send a Task and its Subtasks to Trash as one unit, which `restore` brings back."""
    trash.trash_task(signed_in_user(request), task_id)
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
) -> Status[TaskChangeOut]:
    """Move a Task and its Subtasks under a parent, or to a Project's top level, after a sibling.

    The server picks the new order key. The Task comes back with every Closed ancestor the move
    reopened, so the client can offer Undo.
    """
    destination = placement.Destination(
        move.project_id,
        move.parent_id,
        move.after_id,
        move.section_id,
        section_given="section_id" in move.model_fields_set,
    )
    change = placement.move(signed_in_user(request), task_id, destination)
    return Status(HTTPStatus.OK, task_change_out(change))


@router.post(
    "/{int:task_id}/duplicate",
    response={
        HTTPStatus.CREATED: TaskOut,
        HTTPStatus.NOT_FOUND: ErrorOut,
        HTTPStatus.UNPROCESSABLE_ENTITY: ErrorOut,
    },
    summary="Duplicate a Task",
)
def duplicate_task(request: HttpRequest, task_id: int) -> Status[TaskOut]:
    """Add an open copy of a Task right after it, with its title, Description and Priority."""
    copy = creation.duplicate_task(signed_in_user(request), task_id)
    return Status(HTTPStatus.CREATED, TaskOut.from_orm(copy))


def _edit(patch: TaskPatchIn) -> services.TaskEdit:
    """Return the edit the patch asks for."""
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
        project_id=patch.project_id,
        repeat_rule=patch.repeat_rule,
        repeat_from=patch.repeat_from,
        tag_ids=patch.tag_ids,
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
