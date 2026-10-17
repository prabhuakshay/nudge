"""The user's live Projects, Sections and Tasks, and turning a request's ids into them.

Live means out of Trash: a live Project isn't deleted, a live Section's Project is live, and a
live Task is neither deleted nor in a deleted Project. Every reader and writer starts from these,
so a row in Trash is never shown or changed by accident. An id that isn't one of the user's live
rows, including another user's id, raises `NotFoundError`, which the API answers with 404.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from apps.core.errors import NotFoundError
from apps.tasks.rows import as_rows

if TYPE_CHECKING:
    from collections.abc import Iterable

    from django.db.models import QuerySet

    from apps.accounts.models import User
    from apps.tasks.models import Project, Section, Task

PROJECT_NOT_FOUND = "Project not found."
SECTION_NOT_FOUND = "Section not found."
TASK_NOT_FOUND = "Task not found."


def projects(user: User) -> QuerySet[Project]:
    """Return the user's Projects that aren't in Trash."""
    return user.projects.filter(deleted_at__isnull=True)


def sections(user: User) -> QuerySet[Section]:
    """Return the user's Sections whose Project isn't in Trash."""
    return user.sections.filter(project__deleted_at__isnull=True)


def tasks(user: User) -> QuerySet[Task]:
    """Return the user's Tasks that aren't in Trash, on their own or with their Project."""
    return user.tasks.filter(deleted_at__isnull=True, project__deleted_at__isnull=True)


def project(user: User, project_id: int) -> Project:
    """Return the user's live Project with this id.

    Raises:
        NotFoundError: There's no such Project.
    """
    found = projects(user).filter(pk=project_id).first()
    if found is None:
        raise NotFoundError(PROJECT_NOT_FOUND)
    return found


def section(user: User, section_id: int) -> Section:
    """Return the user's live Section with this id.

    Raises:
        NotFoundError: There's no such Section.
    """
    found = sections(user).filter(pk=section_id).first()
    if found is None:
        raise NotFoundError(SECTION_NOT_FOUND)
    return found


def task(user: User, task_id: int) -> Task:
    """Return the user's live Task with this id, as a list row.

    Raises:
        NotFoundError: There's no such Task.
    """
    found = as_rows(tasks(user).filter(pk=task_id), user).first()
    if found is None:
        raise NotFoundError(TASK_NOT_FOUND)
    return found


def tasks_by_id(user: User, ids: Iterable[int]) -> list[Task]:
    """Return the user's live Tasks with these ids, once each, in the order given.

    Raises:
        NotFoundError: Any id isn't one of the user's live Tasks.
    """
    wanted = list(dict.fromkeys(ids))
    found = tasks(user).in_bulk(wanted)
    if len(found) != len(wanted):
        raise NotFoundError(TASK_NOT_FOUND)
    return [found[pk] for pk in wanted]
