"""Tests for the rules that hold wherever a Task is put: new, moved, put back or brought home."""

from __future__ import annotations

from datetime import date
from typing import TYPE_CHECKING

import pytest
from django.db import transaction

from apps.tasks import creation, placement, projects, sections, services, trash
from apps.tasks.archive import ArchivedProjectError
from apps.tasks.changes import TaskRuleError
from apps.tasks.dates import TaskDates
from apps.tasks.models import Task, TaskActivity
from apps.tasks.repeat import Repeat
from apps.tasks.sections import SectionRuleError

if TYPE_CHECKING:
    from apps.accounts.models import User
    from apps.tasks.models import Project, Section


def _root(project: Project, title: str, section: Section | None = None) -> Task:
    return creation.create_task(project, title, creation.NewTask(section=section))


def _subtask(parent: Task, title: str) -> Task:
    return creation.create_subtask(parent, title).task


def _fresh(task: Task) -> Task:
    return Task.objects.get(pk=task.pk)


def _moved_events(task: Task) -> list[dict[str, object]]:
    return list(task.activity.filter(kind=TaskActivity.Kind.MOVED).values_list("data", flat=True))


@pytest.mark.django_db
def test_a_task_moved_to_another_project_leaves_its_section_and_takes_its_subtasks(
    ada: User,
) -> None:
    work, home = projects.create_project(ada, "Work"), projects.create_project(ada, "Home")
    task = _root(work, "Plan the move", sections.create_section(work, "Soon"))
    step = _subtask(task, "Book the van")

    with transaction.atomic():
        placement.move_to_project(task, home)

    moved = _fresh(task)
    assert (moved.project, moved.section, moved.parent) == (home, None, None)
    assert _fresh(step).project == home
    assert _moved_events(moved) == [
        {
            "from_project": "Work",
            "to_project": "Home",
            "from_parent": None,
            "to_parent": None,
            "from_section": "Soon",
            "to_section": None,
        },
    ]


@pytest.mark.django_db
def test_a_subtask_moved_to_another_project_becomes_its_first_root(ada: User) -> None:
    work, home = projects.create_project(ada, "Work"), projects.create_project(ada, "Home")
    already = _root(home, "Already there")
    step = _subtask(_root(work, "Plan"), "Book the van")

    with transaction.atomic():
        placement.move_to_project(step, home)

    moved = _fresh(step)
    assert (moved.project, moved.parent) == (home, None)
    assert moved.position < _fresh(already).position


@pytest.mark.django_db
def test_a_move_into_another_projects_section_is_refused(ada: User) -> None:
    work, home = projects.create_project(ada, "Work"), projects.create_project(ada, "Home")
    task = _root(work, "Plan")
    elsewhere = sections.create_section(home, "Soon")

    with pytest.raises(SectionRuleError):
        placement.move(
            ada, task.pk, placement.Destination(section_id=elsewhere.pk, section_given=True)
        )


@pytest.mark.django_db
def test_a_subtask_is_never_given_a_section(ada: User) -> None:
    work = projects.create_project(ada, "Work")
    soon = sections.create_section(work, "Soon")
    parent, task = _root(work, "Plan"), _root(work, "Book the van")

    with pytest.raises(TaskRuleError):
        placement.move(ada, task.pk, placement.Destination(parent_id=parent.pk, section_id=soon.pk))


@pytest.mark.django_db
def test_a_task_moved_under_another_drops_its_section_pin_and_repeat(ada: User) -> None:
    work = projects.create_project(ada, "Work")
    parent = _root(work, "Plan")
    task = creation.create_task(
        work,
        "Water the plants",
        creation.NewTask(
            dates=TaskDates(due_date=date(2026, 10, 20)),
            repeat=Repeat("FREQ=WEEKLY", Task.RepeatFrom.DUE),
            section=sections.create_section(work, "Soon"),
        ),
    )
    services.update_task(ada, task.pk, services.TaskEdit(pinned=True))

    placement.move(ada, task.pk, placement.Destination(parent_id=parent.pk))

    moved = _fresh(task)
    assert (moved.parent, moved.section) == (parent, None)
    assert (moved.pinned_at, moved.repeat_rule) == (None, "")


@pytest.mark.django_db
def test_an_archived_project_takes_no_task_in_or_out(ada: User) -> None:
    work, attic = projects.create_project(ada, "Work"), projects.create_project(ada, "Attic")
    task, stored = _root(work, "Plan"), _root(attic, "Old plan")
    projects.archive_project(ada, attic.pk)

    with pytest.raises(ArchivedProjectError):
        placement.move(ada, task.pk, placement.Destination(project_id=attic.pk))
    with pytest.raises(ArchivedProjectError):
        placement.move(ada, stored.pk, placement.Destination(project_id=work.pk))
    with pytest.raises(ArchivedProjectError):
        creation.create_task(_fresh(stored).project, "New plan")


@pytest.mark.django_db
def test_a_task_in_trash_returns_to_its_archived_project(ada: User) -> None:
    attic = projects.create_project(ada, "Attic")
    task = _root(attic, "Old plan", sections.create_section(attic, "Someday"))
    trash.trash_task(ada, task.pk)
    projects.archive_project(ada, attic.pk)
    head = _fresh(task)

    with transaction.atomic():
        placement.return_from_trash(head, [head], services.inbox(ada))

    back = _fresh(task)
    assert (back.project, back.section, back.position) == (attic, task.section, task.position)


@pytest.mark.django_db
def test_a_new_root_cant_join_another_projects_section(ada: User) -> None:
    work, home = projects.create_project(ada, "Work"), projects.create_project(ada, "Home")

    with pytest.raises(SectionRuleError):
        _root(work, "Plan", sections.create_section(home, "Soon"))


@pytest.mark.django_db
def test_a_new_subtask_and_a_copy_of_one_follow_their_roots_section(ada: User) -> None:
    work = projects.create_project(ada, "Work")
    parent = _root(work, "Plan", sections.create_section(work, "Soon"))
    step = _subtask(parent, "Book the van")

    copy = creation.duplicate_task(ada, step.pk)

    assert (step.parent, step.section) == (parent, None)
    assert (copy.parent, copy.section) == (parent, None)


@pytest.mark.django_db
def test_a_place_puts_a_task_back_exactly_where_it_was(ada: User) -> None:
    work, home = projects.create_project(ada, "Work"), projects.create_project(ada, "Home")
    soon = sections.create_section(work, "Soon")
    _root(work, "Second", soon)
    task = _root(work, "First", soon)
    with transaction.atomic():
        place = placement.place_of(_fresh(task))
        placement.move_to_project(_fresh(task), home)

    placement.put_back(ada, place)

    assert placement.place_of(_fresh(task)) == place
    assert (_fresh(task).project, _fresh(task).section) == (work, soon)


@pytest.mark.django_db
def test_a_task_rehomed_to_the_inbox_leaves_its_section(ada: User) -> None:
    work = projects.create_project(ada, "Work")
    task = _root(work, "Plan", sections.create_section(work, "Soon"))
    inbox = services.inbox(ada)

    with transaction.atomic():
        placement.rehome(_fresh(task), inbox)

    assert (_fresh(task).project, _fresh(task).section) == (inbox, None)


@pytest.mark.django_db
def test_a_detached_subtask_becomes_the_last_root_of_its_project(ada: User) -> None:
    work = projects.create_project(ada, "Work")
    parent = _root(work, "Plan")
    step = _subtask(parent, "Book the van")
    newest = _root(work, "Newest")

    with transaction.atomic():
        placement.detach(_fresh(step))

    detached = _fresh(step)
    assert detached.parent is None
    assert detached.position > max(_fresh(parent).position, _fresh(newest).position)
