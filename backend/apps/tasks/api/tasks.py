"""Task endpoints: list a Project's Tasks, add, read, change and duplicate one, read its history."""

from __future__ import annotations

from typing import TYPE_CHECKING

from ninja import Router, Status

from apps.accounts.schemas import ErrorOut
from apps.tasks import schedule, services, tree
from apps.tasks.api import signed_in_user
from apps.tasks.archive import ArchivedProjectError
from apps.tasks.pagination import InvalidCursorError
from apps.tasks.schemas import (
    AffectedTaskOut,
    TaskActivityListOut,
    TaskAncestorOut,
    TaskChangeOut,
    TaskDetailOut,
    TaskIn,
    TaskListOut,
    TaskOut,
    TaskPatchIn,
)

if TYPE_CHECKING:
    from collections.abc import Callable, Iterable

    from django.http import HttpRequest

    from apps.accounts.models import User
    from apps.tasks.models import Task
    from apps.tasks.pagination import Page

router = Router()

_HTTP_OK = 200
_HTTP_CREATED = 201
_HTTP_NOT_FOUND = 404
_HTTP_UNPROCESSABLE = 422
_PROJECT_NOT_FOUND = ErrorOut(detail="Project not found.")
_TASK_NOT_FOUND = ErrorOut(detail="Task not found.")
_PROJECT_OR_VIEW = ErrorOut(detail="Give either a project or a view.")


@router.get(
    "",
    response={_HTTP_OK: TaskListOut, _HTTP_NOT_FOUND: ErrorOut, _HTTP_UNPROCESSABLE: ErrorOut},
    summary="List a Project's or a view's Tasks",
)
def list_tasks(
    request: HttpRequest,
    project: int | None = None,
    view: schedule.View | None = None,
    *,
    closed: bool = False,
    cursor: str | None = None,
) -> Status[TaskListOut] | Status[ErrorOut]:
    """Return the open Tasks of a Project or of a view, or, with `closed`, a page of Closed ones.

    A Project lists its trees in manual order. Today and Upcoming list flat rows by date, with
    Overdue first in Today; Today's Closed Tasks are those closed today. Closed Tasks come most
    recently completed first, in pages; open Tasks come all at once.
    """
    user = signed_in_user(request)
    if view is not None and project is None:
        return _view_tasks(user, view, closed=closed, cursor=cursor)
    if project is not None and view is None:
        return _project_tasks(user, project, closed=closed, cursor=cursor)
    return Status(_HTTP_UNPROCESSABLE, _PROJECT_OR_VIEW)


def _project_tasks(
    user: User,
    project_id: int,
    *,
    closed: bool,
    cursor: str | None,
) -> Status[TaskListOut] | Status[ErrorOut]:
    project = services.live_project(user, project_id)
    if project is None:
        return Status(_HTTP_NOT_FOUND, _PROJECT_NOT_FOUND)
    if not closed:
        return _list(services.open_tasks(project))
    return _page(lambda: services.closed_tasks(project, cursor))


def _view_tasks(
    user: User,
    view: schedule.View,
    *,
    closed: bool,
    cursor: str | None,
) -> Status[TaskListOut] | Status[ErrorOut]:
    if not closed:
        return _list(schedule.view_tasks(user, view))
    if view is not schedule.View.TODAY:
        return Status(_HTTP_UNPROCESSABLE, ErrorOut(detail="Only Today lists Closed tasks."))
    return _page(lambda: schedule.closed_today(user, cursor))


def _list(tasks: Iterable[Task]) -> Status[TaskListOut]:
    items = [TaskOut.from_orm(task) for task in tasks]
    return Status(_HTTP_OK, TaskListOut(items=items, next_cursor=None))


def _page(read: Callable[[], Page[Task]]) -> Status[TaskListOut] | Status[ErrorOut]:
    try:
        page = read()
    except InvalidCursorError as error:
        return Status(_HTTP_UNPROCESSABLE, ErrorOut(detail=str(error)))
    items = [TaskOut.from_orm(task) for task in page.items]
    return Status(_HTTP_OK, TaskListOut(items=items, next_cursor=page.next_cursor))


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
    except ArchivedProjectError as error:
        return Status(_HTTP_UNPROCESSABLE, ErrorOut(detail=str(error)))
    return Status(_HTTP_CREATED, TaskOut.from_orm(created))


def _create_subtask(user: User, parent_id: int, title: str) -> Status[TaskOut] | Status[ErrorOut]:
    parent = services.live_task(user, parent_id)
    if parent is None:
        return Status(_HTTP_NOT_FOUND, _TASK_NOT_FOUND)
    try:
        change = services.create_subtask(parent, title)
    except (services.TaskRuleError, ArchivedProjectError) as error:
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
        project=project,
    )
    try:
        change = services.update_task(user, task_id, edit)
    except (services.TaskRuleError, ArchivedProjectError) as error:
        return Status(_HTTP_UNPROCESSABLE, ErrorOut(detail=str(error)))
    if change is None:
        return Status(_HTTP_NOT_FOUND, _TASK_NOT_FOUND)
    affected = [AffectedTaskOut.from_orm(task) for task in change.affected]
    return Status(_HTTP_OK, TaskChangeOut(task=_detail(change.task), affected=affected))


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


def _dates(body: TaskIn | TaskPatchIn) -> services.TaskDates | None:
    """Return the dates the input sets, an empty set when it clears them, or None if neither."""
    if "dates" not in body.model_fields_set:
        return None
    if body.dates is None:
        return services.TaskDates()
    dates = body.dates
    return services.TaskDates(dates.due_date, dates.due_time, dates.start_date, dates.start_time)


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
