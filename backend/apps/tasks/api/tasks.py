"""Task endpoints: list a Project's or Person's Tasks; add, read, change, move, duplicate one."""

from __future__ import annotations

from datetime import timedelta
from functools import partial
from typing import TYPE_CHECKING

from ninja import Query, Router, Status

from apps.accounts.schemas import ErrorOut
from apps.tasks import moves, people, schedule, services, tree
from apps.tasks.api import signed_in_user
from apps.tasks.archive import ArchivedProjectError
from apps.tasks.dates import TaskDates
from apps.tasks.mentions import MentionError
from apps.tasks.pagination import InvalidCursorError, Page
from apps.tasks.reminders import ReminderRuleError
from apps.tasks.schemas.activity import TaskActivityListOut
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
    from collections.abc import Callable, Iterable

    from django.http import HttpRequest

    from apps.accounts.models import User
    from apps.tasks.models import Task

router = Router()

_HTTP_OK = 200
_HTTP_CREATED = 201
_HTTP_NOT_FOUND = 404
_HTTP_UNPROCESSABLE = 422
_PROJECT_NOT_FOUND = ErrorOut(detail="Project not found.")
_TASK_NOT_FOUND = ErrorOut(detail="Task not found.")
_PERSON_NOT_FOUND = ErrorOut(detail="Person not found.")
_ONE_SOURCE = ErrorOut(detail="Give one of project, person or view.")


@router.get(
    "",
    response={_HTTP_OK: TaskListOut, _HTTP_NOT_FOUND: ErrorOut, _HTTP_UNPROCESSABLE: ErrorOut},
    summary="List a Project's, a Person's or a view's Tasks",
)
def list_tasks(
    request: HttpRequest,
    query: Query[TaskListQuery],
) -> Status[TaskListOut] | Status[ErrorOut]:
    """Return the open Tasks of a Project, Person or view, or, with `closed`, a page of Closed ones.

    A Project's Tasks come in manual order. A Person's are the Tasks that mention them, flat, in
    each Project's manual order. Today and Upcoming list flat rows by date, with Overdue first in
    Today; Today's Closed Tasks are those closed today, and Upcoming has none. Closed Tasks come
    most recently completed first, in pages; open Tasks come all at once.
    """
    source = _list_source(signed_in_user(request), query)
    if isinstance(source, Status):
        return source
    open_tasks, closed_page = source
    if not query.closed:
        items = [TaskOut.from_orm(task) for task in open_tasks()]
        return Status(_HTTP_OK, TaskListOut(items=items, next_cursor=None))
    try:
        page = closed_page(query.cursor)
    except InvalidCursorError as error:
        return Status(_HTTP_UNPROCESSABLE, ErrorOut(detail=str(error)))
    items = [TaskOut.from_orm(task) for task in page.items]
    return Status(_HTTP_OK, TaskListOut(items=items, next_cursor=page.next_cursor))


type _ListSource = tuple[Callable[[], Iterable[Task]], Callable[[str | None], Page[Task]]]


def _list_source(user: User, query: TaskListQuery) -> _ListSource | Status[ErrorOut]:
    """Return how to read the open Tasks and a page of Closed ones of the list asked for."""
    if query.view is not None:
        return _view_source(user, query.view)
    if query.person is not None:
        return _person_source(user, query.person)
    if query.project is not None:
        return _project_source(user, query.project)
    return Status(_HTTP_UNPROCESSABLE, _ONE_SOURCE)


def _person_source(user: User, person: int) -> _ListSource | Status[ErrorOut]:
    found = people.person(user, person)
    if found is None:
        return Status(_HTTP_NOT_FOUND, _PERSON_NOT_FOUND)
    return partial(people.open_tasks, found), partial(people.closed_tasks, found)


def _view_source(user: User, view: schedule.View) -> _ListSource:
    open_tasks = partial(schedule.view_tasks, user, view)
    if view is schedule.View.TODAY:
        return open_tasks, partial(schedule.closed_today, user)
    return open_tasks, _nothing_closed


def _nothing_closed(_cursor: str | None) -> Page[Task]:
    return Page(items=[], next_cursor=None)


def _project_source(user: User, project: int) -> _ListSource | Status[ErrorOut]:
    found = services.live_project(user, project)
    if found is None:
        return Status(_HTTP_NOT_FOUND, _PROJECT_NOT_FOUND)
    return partial(services.open_tasks, found), partial(services.closed_tasks, found)


@router.post(
    "",
    response={_HTTP_CREATED: TaskOut, _HTTP_NOT_FOUND: ErrorOut, _HTTP_UNPROCESSABLE: ErrorOut},
    summary="Add a Task",
)
def create_task(request: HttpRequest, task: TaskIn) -> Status[TaskOut] | Status[ErrorOut]:
    """Add a Task first in its Project, or in the Inbox when no Project is given.

    With `parent_id` it is added last under that Task instead, which reopens the parent and its
    ancestors if they are Closed.
    """
    user = signed_in_user(request)
    if task.parent_id is not None:
        return _create_subtask(user, task.parent_id, task.title)
    project = (
        services.inbox(user)
        if task.project_id is None
        else services.live_project(user, task.project_id)
    )
    if project is None:
        return Status(_HTTP_NOT_FOUND, _PROJECT_NOT_FOUND)
    try:
        created = services.create_task(project, task.title, _dates(task))
    except (MentionError, ArchivedProjectError) as error:
        return Status(_HTTP_UNPROCESSABLE, ErrorOut(detail=str(error)))
    return Status(_HTTP_CREATED, TaskOut.from_orm(created))


def _create_subtask(user: User, parent_id: int, title: str) -> Status[TaskOut] | Status[ErrorOut]:
    parent = services.live_task(user, parent_id)
    if parent is None:
        return Status(_HTTP_NOT_FOUND, _TASK_NOT_FOUND)
    try:
        change = services.create_subtask(parent, title)
    except (services.TaskRuleError, MentionError, ArchivedProjectError) as error:
        return Status(_HTTP_UNPROCESSABLE, ErrorOut(detail=str(error)))
    return Status(_HTTP_CREATED, TaskOut.from_orm(change.task))


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


@router.get(
    "/{int:task_id}",
    response={_HTTP_OK: TaskDetailOut, _HTTP_NOT_FOUND: ErrorOut},
    summary="Get a Task",
)
def get_task(request: HttpRequest, task_id: int) -> Status[TaskDetailOut] | Status[ErrorOut]:
    """Return a Task with everything the detail drawer shows."""
    task = services.live_task(signed_in_user(request), task_id)
    if task is None:
        return Status(_HTTP_NOT_FOUND, _TASK_NOT_FOUND)
    return Status(_HTTP_OK, _detail(task))


@router.patch(
    "/{int:task_id}",
    response={_HTTP_OK: TaskChangeOut, _HTTP_NOT_FOUND: ErrorOut, _HTTP_UNPROCESSABLE: ErrorOut},
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
    project = None
    if patch.project_id is not None:
        project = services.live_project(user, patch.project_id)
        if project is None:
            return Status(_HTTP_NOT_FOUND, _PROJECT_NOT_FOUND)
    edit = services.TaskEdit(
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
    )
    try:
        change = services.update_task(user, task_id, edit)
    except (
        services.TaskRuleError,
        MentionError,
        ReminderRuleError,
        ArchivedProjectError,
    ) as error:
        return Status(_HTTP_UNPROCESSABLE, ErrorOut(detail=str(error)))
    if change is None:
        return Status(_HTTP_NOT_FOUND, _TASK_NOT_FOUND)
    affected = [AffectedTaskOut.from_orm(task) for task in change.affected]
    return Status(_HTTP_OK, TaskChangeOut(task=_detail(change.task), affected=affected))


@router.post(
    "/{int:task_id}/move",
    response={_HTTP_OK: TaskChangeOut, _HTTP_NOT_FOUND: ErrorOut, _HTTP_UNPROCESSABLE: ErrorOut},
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
        return Status(_HTTP_NOT_FOUND, _TASK_NOT_FOUND)
    if isinstance(destination, ErrorOut):
        return Status(_HTTP_NOT_FOUND, destination)
    try:
        change = moves.move_task(task, destination)
    except (services.TaskRuleError, ArchivedProjectError) as error:
        return Status(_HTTP_UNPROCESSABLE, ErrorOut(detail=str(error)))
    affected = [AffectedTaskOut.from_orm(task) for task in change.affected]
    return Status(_HTTP_OK, TaskChangeOut(task=_detail(change.task), affected=affected))


def _destination(user: User, move: TaskMoveIn) -> moves.Destination | ErrorOut:
    """Resolve the move's ids to the user's Project and parent, or say which wasn't found."""
    project = parent = None
    if move.project_id is not None:
        project = services.live_project(user, move.project_id)
        if project is None:
            return _PROJECT_NOT_FOUND
    if move.parent_id is not None:
        parent = services.live_task(user, move.parent_id)
        if parent is None:
            return _TASK_NOT_FOUND
    return moves.Destination(project, parent, move.after_id)


@router.post(
    "/{int:task_id}/duplicate",
    response={_HTTP_CREATED: TaskOut, _HTTP_NOT_FOUND: ErrorOut, _HTTP_UNPROCESSABLE: ErrorOut},
    summary="Duplicate a Task",
)
def duplicate_task(request: HttpRequest, task_id: int) -> Status[TaskOut] | Status[ErrorOut]:
    """Add an open copy of a Task right after it, with its title, Description and Priority."""
    try:
        copy = services.duplicate_task(signed_in_user(request), task_id)
    except ArchivedProjectError as error:
        return Status(_HTTP_UNPROCESSABLE, ErrorOut(detail=str(error)))
    if copy is None:
        return Status(_HTTP_NOT_FOUND, _TASK_NOT_FOUND)
    return Status(_HTTP_CREATED, TaskOut.from_orm(copy))


def _dates(body: TaskIn | TaskPatchIn) -> TaskDates | None:
    """Return the dates the input sets, an empty set when it clears them, or None if neither."""
    if "dates" not in body.model_fields_set:
        return None
    if body.dates is None:
        return TaskDates()
    dates = body.dates
    return TaskDates(dates.due_date, dates.due_time, dates.start_date, dates.start_time)


@router.get(
    "/{int:task_id}/activity",
    response={
        _HTTP_OK: TaskActivityListOut,
        _HTTP_NOT_FOUND: ErrorOut,
        _HTTP_UNPROCESSABLE: ErrorOut,
    },
    summary="List a Task's Activity",
)
def list_activity(
    request: HttpRequest,
    task_id: int,
    cursor: str | None = None,
) -> Status[TaskActivityListOut] | Status[ErrorOut]:
    """Return a page of a Task's history, newest first, with the number of events in all."""
    task = services.live_task(signed_in_user(request), task_id)
    if task is None:
        return Status(_HTTP_NOT_FOUND, _TASK_NOT_FOUND)
    try:
        page = services.task_activity(task, cursor)
    except InvalidCursorError as error:
        return Status(_HTTP_UNPROCESSABLE, ErrorOut(detail=str(error)))
    activity = TaskActivityListOut.model_validate(
        {
            "items": page.items,
            "next_cursor": page.next_cursor,
            "count": services.activity_count(task),
        },
    )
    return Status(_HTTP_OK, activity)
