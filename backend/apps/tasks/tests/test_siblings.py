"""Tests for ordered sibling sets and the sort keys they hand out."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from django.db.transaction import TransactionManagementError
from django.utils import timezone

from apps.core.palette import PaletteColor
from apps.tasks import projects
from apps.tasks.models import Folder, Project, Section, Tag, Task
from apps.tasks.siblings import (
    SiblingRef,
    section_siblings,
    sidebar_siblings,
    tag_siblings,
    task_siblings,
)

if TYPE_CHECKING:
    from collections.abc import Callable

    from apps.accounts.models import User
    from apps.tasks.siblings import Siblings


def _task(project: Project, position: str, parent: Task | None = None) -> Task:
    return Task.objects.create(
        owner=project.owner,
        project=project,
        parent=parent,
        title=position,
        position=position,
    )


@pytest.mark.django_db
def test_last_sorts_after_every_root(ada: User) -> None:
    work = projects.create_project(ada, "Work")
    root = _task(work, "a1")
    _task(work, "a5", parent=root)

    key = task_siblings(work.pk, None).last()

    assert "a1" < key < "a5"


@pytest.mark.django_db
def test_first_sorts_before_every_root(ada: User) -> None:
    work = projects.create_project(ada, "Work")
    _task(work, "a1")
    _task(work, "a3")

    assert task_siblings(work.pk, None).first() < "a1"


@pytest.mark.django_db
def test_first_and_last_of_an_empty_set_are_both_a_starting_key(ada: User) -> None:
    work = projects.create_project(ada, "Work")
    roots = task_siblings(work.pk, None)

    assert roots.first() == roots.last() == "a0"


@pytest.mark.django_db
def test_after_a_sibling_sorts_between_it_and_the_next(ada: User) -> None:
    work = projects.create_project(ada, "Work")
    first = _task(work, "a1")
    _task(work, "a2")

    key = task_siblings(work.pk, None).after(first.pk)

    assert "a1" < key < "a2"


@pytest.mark.django_db
def test_after_nothing_is_first_and_after_a_stranger_is_last(ada: User) -> None:
    work = projects.create_project(ada, "Work")
    _task(work, "a1")
    stranger = _task(projects.create_project(ada, "Home"), "a5")
    roots = task_siblings(work.pk, None)

    assert roots.after(None) < "a1"
    assert roots.after(stranger.pk) > "a1"


@pytest.mark.django_db
def test_moving_a_row_to_where_it_already_is_gives_back_its_key(ada: User) -> None:
    work = projects.create_project(ada, "Work")
    first = _task(work, "a1")
    second = _task(work, "a2")
    _task(work, "a3")

    assert task_siblings(work.pk, None).after(first.pk, moving=second.pk) == "a2"


@pytest.mark.django_db
def test_after_a_sibling_sharing_its_key_sorts_after_both(ada: User) -> None:
    work = projects.create_project(ada, "Work")
    tied = _task(work, "a1")
    _task(work, "a1")
    _task(work, "a2")

    key = task_siblings(work.pk, None).after(tied.pk)

    assert "a1" < key < "a2"


@pytest.mark.django_db
def test_a_row_coming_back_keeps_its_key_while_no_other_sibling_has_it(ada: User) -> None:
    work = projects.create_project(ada, "Work")
    returning = _task(work, "a1")
    _task(work, "a2")

    assert task_siblings(work.pk, None).keep(returning.pk, "a1") == "a1"


@pytest.mark.django_db
def test_a_row_coming_back_to_a_taken_key_goes_right_after_the_sibling_holding_it(
    ada: User,
) -> None:
    work = projects.create_project(ada, "Work")
    returning = _task(work, "a0")
    _task(work, "a1")
    _task(work, "a2")

    key = task_siblings(work.pk, None).keep(returning.pk, "a1")

    assert "a1" < key < "a2"


@pytest.mark.django_db
def test_keys_after_a_sibling_fit_between_it_and_the_next_in_order(ada: User) -> None:
    work = projects.create_project(ada, "Work")
    first = _task(work, "a1")
    _task(work, "a2")

    keys = task_siblings(work.pk, None).keys_after(first.pk, 3)

    assert len(keys) == 3
    assert "a1" < keys[0] < keys[1] < keys[2] < "a2"


@pytest.mark.django_db
def test_before_names_the_sibling_a_row_follows_breaking_ties_by_id(ada: User) -> None:
    work = projects.create_project(ada, "Work")
    first = _task(work, "a1")
    tied = _task(work, "a1")
    last = _task(work, "a2")
    roots = task_siblings(work.pk, None)

    assert roots.before(first.pk) is None
    assert roots.before(tied.pk) == first.pk
    assert roots.before(last.pk) == tied.pk


@pytest.mark.django_db
def test_a_subtask_set_holds_only_the_parents_children(ada: User) -> None:
    work = projects.create_project(ada, "Work")
    parent = _task(work, "a1")
    _task(work, "a5")
    child = _task(work, "a3", parent=parent)

    subtasks = task_siblings(work.pk, parent.pk)

    assert subtasks.before(child.pk) is None
    assert "a3" < subtasks.last() < "a5"


@pytest.mark.django_db
def test_a_section_set_holds_only_the_projects_sections(ada: User) -> None:
    work = projects.create_project(ada, "Work")
    home = projects.create_project(ada, "Home")
    Section.objects.create(owner=ada, project=work, name="Doing", position="a1")
    Section.objects.create(owner=ada, project=home, name="Later", position="a3")

    assert "a1" < section_siblings(work.pk).last() < "a3"


@pytest.mark.django_db
def test_a_tag_set_holds_only_the_users_tags(ada: User, grace: User) -> None:
    Tag.objects.create(owner=ada, name="errand", position="a1")
    Tag.objects.create(owner=grace, name="errand", position="a3")

    assert "a1" < tag_siblings(ada).last() < "a3"


def _project(user: User, position: str, folder: Folder | None = None) -> Project:
    return Project.objects.create(
        owner=user,
        name=position,
        color=PaletteColor.values[0],
        icon=Project.Icon.LIST,
        folder=folder,
        position=position,
    )


@pytest.mark.django_db
def test_the_sidebars_top_level_mixes_folders_and_ungrouped_live_projects(ada: User) -> None:
    folder = Folder.objects.create(owner=ada, name="Areas", position="a2")
    first = _project(ada, "a1")
    _project(ada, "a3")
    _project(ada, "a6", folder=folder)
    Project.objects.filter(pk=_project(ada, "a5").pk).update(deleted_at=timezone.now())
    top_level = sidebar_siblings(ada, None)

    assert top_level.before(SiblingRef("folder", folder.pk)) == SiblingRef("project", first.pk)
    assert "a3" < top_level.last() < "a5"


@pytest.mark.django_db
def test_a_folders_set_holds_only_its_projects(ada: User) -> None:
    folder = Folder.objects.create(owner=ada, name="Areas", position="a1")
    _project(ada, "a3")
    inside = _project(ada, "a2", folder=folder)

    assert sidebar_siblings(ada, folder).after(SiblingRef("project", inside.pk)) >= "a3"


@pytest.mark.django_db(transaction=True)
@pytest.mark.parametrize(
    "siblings_of",
    [
        lambda project: task_siblings(project.pk, None),
        lambda project: section_siblings(project.pk),
        lambda project: tag_siblings(project.owner),
        lambda project: sidebar_siblings(project.owner, None),
    ],
    ids=["tasks", "sections", "tags", "sidebar"],
)
def test_every_set_locks_before_handing_out_a_key(
    ada: User,
    siblings_of: Callable[[Project], Siblings[object]],
) -> None:
    siblings = siblings_of(projects.create_project(ada, "Work"))

    with pytest.raises(TransactionManagementError):
        siblings.last()


@pytest.mark.django_db(transaction=True)
@pytest.mark.parametrize(
    "place",
    [
        lambda roots: roots.first(),
        lambda roots: roots.last(),
        lambda roots: roots.after(None),
        lambda roots: roots.keys_after(0, 2),
        lambda roots: roots.keep(0, "a0"),
        lambda roots: roots.lock(),
    ],
    ids=["first", "last", "after", "keys_after", "keep", "lock"],
)
def test_every_way_of_placing_a_row_locks_the_set_first(
    ada: User,
    place: Callable[[Siblings[int]], object],
) -> None:
    roots = task_siblings(projects.create_project(ada, "Work").pk, None)

    with pytest.raises(TransactionManagementError):
        place(roots)
