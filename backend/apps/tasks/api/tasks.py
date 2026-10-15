"""Task endpoints: list a Project's or Tag's Tasks, add, read and change one, read its history."""

from __future__ import annotations

from typing import TYPE_CHECKING

from ninja import Router, Status

from apps.accounts.schemas import ErrorOut
from apps.tasks import services, tags
from apps.tasks.api import signed_in_user
from apps.tasks.pagination import InvalidCursorError
from apps.tasks.schemas import (
    AffectedTaskOut,
    TaskActivityListOut,
    TaskChangeOut,
    TaskDetailOut,
    TaskIn,
    TaskListOut,
    TaskOut,
    TaskPatchIn,
)

if TYPE_CHECKING:
    from django.http import HttpRequest

    from apps.accounts.models import User
    from apps.tasks.models import Project, Tag

router = Router()

_HTTP_OK = 200
_HTTP_CREATED = 201
_HTTP_NOT_FOUND = 404
_HTTP_UNPROCESSABLE = 422
_PROJECT_NOT_FOUND = ErrorOut(detail="Project not found.")
_TASK_NOT_FOUND = ErrorOut(detail="Task not found.")
_TAG_NOT_FOUND = ErrorOut(detail="Tag not found.")


def _source(
    user: User,
    project_id: int | None,
    tag_id: int | None,
) -> Project | Tag | Status[ErrorOut]:
    """Return the user's Project or Tag whose Tasks to list, or the error to answer with."""
    if (project_id is None) == (tag_id is None):
        return Status(_HTTP_UNPROCESSABLE, ErrorOut(detail="Give either a project or a tag."))
    if project_id is not None:
        project = services.live_project(user, project_id)
        return project or Status(_HTTP_NOT_FOUND, _PROJECT_NOT_FOUND)
    return tags.tag(user, tag_id or 0) or Status(_HTTP_NOT_FOUND, _TAG_NOT_FOUND)


@router.get(
    "",
    response={_HTTP_OK: TaskListOut, _HTTP_NOT_FOUND: ErrorOut, _HTTP_UNPROCESSABLE: ErrorOut},
    summary="List a Project's or Tag's Tasks",
)
def list_tasks(
    request: HttpRequest,
    project: int | None = None,
    tag: int | None = None,
    *,
    closed: bool = False,
    cursor: str | None = None,
) -> Status[TaskListOut] | Status[ErrorOut]:
    """Return the open Tasks of a Project or a Tag, or, with `closed`, a page of Closed ones.

    Give exactly one of `project` and `tag`. A Tag's Tasks come from all of the user's Projects,
    in each Project's manual order. Closed Tasks come most recently completed first, in pages;
    open Tasks come all at once.
    """
    found = _source(signed_in_user(request), project, tag)
    if isinstance(found, Status):
        return found
    if not closed:
        items = [TaskOut.from_orm(task) for task in services.open_tasks(found)]
        return Status(_HTTP_OK, TaskListOut(items=items, next_cursor=None))
    try:
        page = services.closed_tasks(found, cursor)
    except InvalidCursorError as error:
        return Status(_HTTP_UNPROCESSABLE, ErrorOut(detail=str(error)))
    items = [TaskOut.from_orm(task) for task in page.items]
    return Status(_HTTP_OK, TaskListOut(items=items, next_cursor=page.next_cursor))


@router.post(
    "",
    response={_HTTP_CREATED: TaskOut, _HTTP_NOT_FOUND: ErrorOut},
    summary="Add a Task",
)
def create_task(request: HttpRequest, task: TaskIn) -> Status[TaskOut] | Status[ErrorOut]:
    """Add a Task first in its Project, or in the Inbox when no Project is given.

    Tags named in `tags` that the user doesn't have yet are created with the Task.
    """
    user = signed_in_user(request)
    project = (
        services.inbox(user)
        if task.project_id is None
        else services.live_project(user, task.project_id)
    )
    if project is None:
        return Status(_HTTP_NOT_FOUND, _PROJECT_NOT_FOUND)
    picked = tags.owned_tags(user, task.tag_ids)
    if picked is None:
        return Status(_HTTP_NOT_FOUND, _TAG_NOT_FOUND)
    created = services.create_task(project, task.title, tags=picked, tag_names=task.tags)
    return Status(_HTTP_CREATED, TaskOut.from_orm(created))


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
    return Status(_HTTP_OK, TaskDetailOut.from_orm(task))


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
    edit = _edit(user, patch)
    if isinstance(edit, Status):
        return edit
    try:
        change = services.update_task(user, task_id, edit)
    except services.TaskRuleError as error:
        return Status(_HTTP_UNPROCESSABLE, ErrorOut(detail=str(error)))
    if change is None:
        return Status(_HTTP_NOT_FOUND, _TASK_NOT_FOUND)
    affected = [AffectedTaskOut.from_orm(task) for task in change.affected]
    return Status(
        _HTTP_OK, TaskChangeOut(task=TaskDetailOut.from_orm(change.task), affected=affected)
    )


def _edit(user: User, patch: TaskPatchIn) -> services.TaskEdit | Status[ErrorOut]:
    """Return the edit the patch asks for, or a 404 if it names another user's Project or Tag."""
    project = None
    if patch.project_id is not None:
        project = services.live_project(user, patch.project_id)
        if project is None:
            return Status(_HTTP_NOT_FOUND, _PROJECT_NOT_FOUND)
    picked = None if patch.tag_ids is None else tags.owned_tags(user, patch.tag_ids)
    if patch.tag_ids is not None and picked is None:
        return Status(_HTTP_NOT_FOUND, _TAG_NOT_FOUND)
    return services.TaskEdit(
        title=patch.title,
        description=patch.description,
        status=patch.status,
        blocked_reason=patch.blocked_reason,
        priority=patch.priority,
        dates=_dates(patch),
        project=project,
        tags=picked,
    )


def _dates(patch: TaskPatchIn) -> services.TaskDates | None:
    """Return the dates the patch sets, an empty set when it clears them, or None if neither."""
    if "dates" not in patch.model_fields_set:
        return None
    if patch.dates is None:
        return services.TaskDates()
    dates = patch.dates
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
