"""Where the Task list endpoint reads from: a Project's, Person's, Tag's or view's Tasks."""

from __future__ import annotations

from functools import partial
from http import HTTPStatus
from typing import TYPE_CHECKING, Literal

from ninja import Status

from apps.core.schemas import ErrorOut
from apps.tasks import people, schedule, sections, services, tags
from apps.tasks.api.errors import (
    PERSON_NOT_FOUND,
    PROJECT_NOT_FOUND,
    SECTION_NOT_FOUND,
    TAG_NOT_FOUND,
)
from apps.tasks.pagination import Page

if TYPE_CHECKING:
    from collections.abc import Callable, Iterable

    from apps.accounts.models import User
    from apps.tasks.models import Task
    from apps.tasks.schemas.tasks import TaskListQuery

_ONE_SOURCE = ErrorOut(detail="Give one of project, person, tag or view.")

type ListSource = tuple[Callable[[], Iterable[Task]], Callable[[str | None], Page[Task]]]


def list_source(user: User, query: TaskListQuery) -> ListSource | Status[ErrorOut]:
    """Return how to read the open Tasks and a page of Closed ones of the list asked for."""
    if query.view is not None:
        return _view_source(user, query.view)
    by_id = (
        (query.person, _person_source),
        (query.tag, _tag_source),
        (query.project, partial(_project_source, section=query.section)),
    )
    for source_id, source in by_id:
        if source_id is not None:
            return source(user, source_id)
    return Status(HTTPStatus.UNPROCESSABLE_ENTITY, _ONE_SOURCE)


def _person_source(user: User, person: int) -> ListSource | Status[ErrorOut]:
    found = people.person(user, person)
    if found is None:
        return Status(HTTPStatus.NOT_FOUND, PERSON_NOT_FOUND)
    return partial(people.open_tasks, found), partial(people.closed_tasks, found)


def _view_source(user: User, view: schedule.View) -> ListSource:
    open_tasks = partial(schedule.view_tasks, user, view)
    if view is schedule.View.TODAY:
        return open_tasks, partial(schedule.closed_today, user)
    return open_tasks, _nothing_closed


def _nothing_closed(_cursor: str | None) -> Page[Task]:
    return Page(items=[], next_cursor=None)


def _tag_source(user: User, tag: int) -> ListSource | Status[ErrorOut]:
    found = tags.tag(user, tag)
    if found is None:
        return Status(HTTPStatus.NOT_FOUND, TAG_NOT_FOUND)
    return partial(tags.open_tasks, found), partial(tags.closed_tasks, found)


def _project_source(
    user: User,
    project: int,
    section: int | Literal["none"] | None,
) -> ListSource | Status[ErrorOut]:
    found = services.live_project(user, project)
    if found is None:
        return Status(HTTPStatus.NOT_FOUND, PROJECT_NOT_FOUND)
    if section is None:
        return partial(services.open_tasks, found), partial(services.closed_tasks, found)
    if section == "none":
        picked = None
    else:
        picked = sections.project_section(found, section)
        if picked is None:
            return Status(HTTPStatus.NOT_FOUND, SECTION_NOT_FOUND)
    return (
        partial(services.section_open_tasks, found, picked),
        partial(services.section_closed_tasks, found, picked),
    )
