"""The sibling sets of Tasks, Sections, Tags and the sidebar's Folders and Projects."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Literal

from apps.accounts.models import User
from apps.core.siblings import Siblings, by_key, row_lock
from apps.tasks import live
from apps.tasks.models import Project, Section, Task

if TYPE_CHECKING:
    from apps.tasks.models import Folder


def task_siblings(project_id: int, parent_id: int | None) -> Siblings[int]:
    """Return a Project's root Tasks, or a Task's Subtasks, ordered by key and then id.

    Trashed Tasks keep their place, so they stay in the set. Writes lock the Project.
    """
    rows = Task.objects.filter(project_id=project_id, parent_id=parent_id)
    return by_key(row_lock(Project.objects.filter(pk=project_id)), rows)


def section_siblings(project_id: int) -> Siblings[int]:
    """Return a Project's Sections, ordered by key and then id. Writes lock the Project."""
    rows = Section.objects.filter(project_id=project_id)
    return by_key(row_lock(Project.objects.filter(pk=project_id)), rows)


def tag_siblings(user: User) -> Siblings[int]:
    """Return the user's Tags, ordered by key and then id. Writes lock the user."""
    return by_key(row_lock(User.objects.filter(pk=user.pk)), user.tags.all())


@dataclass(frozen=True)
class SiblingRef:
    """A Folder or Project in the sidebar, named by kind because the two share one order."""

    kind: Literal["folder", "project"]
    id: int


def sidebar_siblings(user: User, folder: Folder | None) -> Siblings[SiblingRef]:
    """Return a Folder's live Projects, or the sidebar's top level for no Folder.

    The top level mixes Folders and ungrouped Projects in one order, by key and then id. The Inbox
    is never a sibling. Writes lock the user.
    """

    def ordered() -> list[tuple[SiblingRef, str]]:
        projects = live.projects(user).filter(is_inbox=False, folder=folder)
        siblings = [
            (SiblingRef("project", pk), position)
            for pk, position in projects.values_list("pk", "position")
        ]
        if folder is None:
            siblings += [
                (SiblingRef("folder", pk), position)
                for pk, position in user.folders.values_list("pk", "position")
            ]
        return sorted(siblings, key=lambda sibling: (sibling[1], sibling[0].id))

    def before(ref: SiblingRef) -> SiblingRef | None:
        refs = [sibling for sibling, _ in ordered()]
        index = refs.index(ref)
        return refs[index - 1] if index > 0 else None

    return Siblings(lock=row_lock(User.objects.filter(pk=user.pk)), ordered=ordered, before=before)
