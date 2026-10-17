"""Tests for turning ids into the user's live Projects, Sections and Tasks."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from apps.core.errors import NotFoundError
from apps.tasks import creation, live, project_trash, projects, sections, services, trash
from apps.tasks.schemas.tasks import TaskOut

if TYPE_CHECKING:
    from apps.accounts.models import User


@pytest.mark.django_db
def test_a_project_is_found_by_its_owner(ada: User) -> None:
    work = projects.create_project(ada, "Work")

    assert live.project(ada, work.pk) == work


@pytest.mark.django_db
def test_another_users_project_is_not_found(ada: User, grace: User) -> None:
    theirs = projects.create_project(grace, "Theirs")

    with pytest.raises(NotFoundError, match=r"^Project not found\.$"):
        live.project(ada, theirs.pk)


@pytest.mark.django_db
def test_a_project_in_trash_is_not_found(ada: User) -> None:
    work = projects.create_project(ada, "Work")
    project_trash.trash_project(ada, work.pk)

    with pytest.raises(NotFoundError):
        live.project(ada, work.pk)


@pytest.mark.django_db
def test_a_section_in_a_trashed_project_is_not_found(ada: User) -> None:
    work = projects.create_project(ada, "Work")
    to_do = sections.create_section(work, "To do")
    project_trash.trash_project(ada, work.pk)

    with pytest.raises(NotFoundError, match=r"^Section not found\.$"):
        live.section(ada, to_do.pk)


@pytest.mark.django_db
def test_another_users_section_is_not_found(ada: User, grace: User) -> None:
    theirs = sections.create_section(projects.create_project(grace, "Theirs"), "To do")

    with pytest.raises(NotFoundError):
        live.section(ada, theirs.pk)


@pytest.mark.django_db
def test_a_task_comes_as_a_list_row(ada: User) -> None:
    task = creation.create_task(services.inbox(ada), "Report")

    row = TaskOut.from_orm(live.task(ada, task.pk))

    assert row.id == task.pk
    assert row.comment_count == 0


@pytest.mark.django_db
def test_a_task_in_trash_is_not_found(ada: User) -> None:
    task = creation.create_task(services.inbox(ada), "Report")
    trash.trash_task(ada, task.pk)

    with pytest.raises(NotFoundError, match=r"^Task not found\.$"):
        live.task(ada, task.pk)


@pytest.mark.django_db
def test_a_task_in_a_trashed_project_is_not_found(ada: User) -> None:
    work = projects.create_project(ada, "Work")
    task = creation.create_task(work, "Report")
    project_trash.trash_project(ada, work.pk)

    with pytest.raises(NotFoundError):
        live.task(ada, task.pk)


@pytest.mark.django_db
def test_another_users_task_is_not_found(ada: User, grace: User) -> None:
    theirs = creation.create_task(services.inbox(grace), "Theirs")

    with pytest.raises(NotFoundError):
        live.task(ada, theirs.pk)


@pytest.mark.django_db
def test_several_tasks_come_once_each_in_the_order_given(ada: User) -> None:
    inbox = services.inbox(ada)
    first, second = creation.create_task(inbox, "First"), creation.create_task(inbox, "Second")

    assert live.tasks_by_id(ada, [second.pk, first.pk, second.pk]) == [second, first]


@pytest.mark.django_db
def test_several_tasks_are_not_found_if_any_is_not_the_users(ada: User, grace: User) -> None:
    mine = creation.create_task(services.inbox(ada), "Mine")
    theirs = creation.create_task(services.inbox(grace), "Theirs")

    with pytest.raises(NotFoundError):
        live.tasks_by_id(ada, [mine.pk, theirs.pk])
