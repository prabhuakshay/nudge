"""Ordered sibling sets: the one place that knows which rows share an order and hands out keys.

Every ordered thing in Nudge sorts by a fractional-indexing `position` key among its siblings.
A sibling set knows its scope (which rows share the order), the row it locks so two writers never
hand out the same key, and its tie-break, and answers where a row goes: first, last, after
another, back where it was, or who it follows.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Literal

from fractional_indexing import generate_key_between, generate_n_keys_between

from apps.accounts.models import User
from apps.tasks.models import Project, Section, Task

if TYPE_CHECKING:
    from collections.abc import Callable

    from apps.tasks.models import Folder


@dataclass(frozen=True)
class Siblings[Ref]:
    """An ordered set of siblings, each named by a reference such as its id.

    Every method that returns a key locks the set first, so call it inside a transaction.
    """

    _lock: Callable[[], None]
    _ordered: Callable[[], list[tuple[Ref, str]]]

    def _locked(self, moving: Ref | None = None) -> list[tuple[Ref, str]]:
        """Lock the set and return its siblings in order, leaving out the row being placed."""
        self._lock()
        return [(ref, key) for ref, key in self._ordered() if ref != moving]

    def first(self) -> str:
        """Return a key before every sibling."""
        return self.after(None)

    def last(self) -> str:
        """Return a key after every sibling."""
        siblings = self._locked()
        return str(generate_key_between(siblings[-1][1] if siblings else None, None))

    def after(self, ref: Ref | None, moving: Ref | None = None) -> str:
        """Return a key right after `ref`: first for None, last when `ref` isn't a sibling.

        `moving` is the row being placed, if it's already in the set. Siblings that share `ref`'s
        key can't be split, so the key goes after all of them.
        """
        return str(generate_key_between(*_gap_after(self._locked(moving), ref)))

    def keys_after(self, ref: Ref, count: int) -> list[str]:
        """Return `count` keys in order right after `ref`, as `after` places one."""
        keys = generate_n_keys_between(*_gap_after(self._locked(), ref), count)
        return [str(key) for key in keys]

    def keep(self, ref: Ref, key: str) -> str:
        """Return the key a row coming back had, or one right after the sibling now holding it.

        Two siblings can't share a key, or nothing could ever be placed between them.
        """
        siblings = self._locked(ref)
        clash = next((sibling for sibling, taken in siblings if taken == key), None)
        if clash is None:
            return key
        return str(generate_key_between(*_gap_after(siblings, clash)))

    def before(self, ref: Ref) -> Ref | None:
        """Return the sibling right before `ref`, or None when it's first. It takes no lock."""
        refs = [sibling for sibling, _ in self._ordered()]
        index = refs.index(ref)
        return refs[index - 1] if index > 0 else None


def _gap_after[Ref](
    siblings: list[tuple[Ref, str]],
    ref: Ref | None,
) -> tuple[str | None, str | None]:
    """Return the keys a new key right after `ref` goes between; None is an open end."""
    keys = [key for _, key in siblings]
    refs = [sibling for sibling, _ in siblings]
    if ref is None:
        return None, keys[0] if keys else None
    if ref not in refs:
        return keys[-1] if keys else None, None
    key = keys[refs.index(ref)]
    return key, next((later for later in keys if later > key), None)


def _lock_project(project_id: int) -> Callable[[], None]:
    def lock() -> None:
        Project.objects.select_for_update().get(pk=project_id)

    return lock


def _lock_user(user: User) -> Callable[[], None]:
    def lock() -> None:
        User.objects.select_for_update().get(pk=user.pk)

    return lock


def task_siblings(project_id: int, parent_id: int | None) -> Siblings[int]:
    """Return a Project's root Tasks, or a Task's Subtasks, ordered by key and then id.

    Trashed Tasks keep their place, so they stay in the set. Writes lock the Project.
    """

    def ordered() -> list[tuple[int, str]]:
        rows = Task.objects.filter(project_id=project_id, parent_id=parent_id)
        return list(rows.order_by("position", "id").values_list("pk", "position"))

    return Siblings(_lock_project(project_id), ordered)


def section_siblings(project_id: int) -> Siblings[int]:
    """Return a Project's Sections, ordered by key and then id. Writes lock the Project."""

    def ordered() -> list[tuple[int, str]]:
        rows = Section.objects.filter(project_id=project_id)
        return list(rows.order_by("position", "id").values_list("pk", "position"))

    return Siblings(_lock_project(project_id), ordered)


def tag_siblings(user: User) -> Siblings[int]:
    """Return the user's Tags, ordered by key and then id. Writes lock the user."""

    def ordered() -> list[tuple[int, str]]:
        return list(user.tags.order_by("position", "id").values_list("pk", "position"))

    return Siblings(_lock_user(user), ordered)


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
        live = user.projects.filter(deleted_at__isnull=True, is_inbox=False, folder=folder)
        siblings = [
            (SiblingRef("project", pk), position)
            for pk, position in live.values_list("pk", "position")
        ]
        if folder is None:
            siblings += [
                (SiblingRef("folder", pk), position)
                for pk, position in user.folders.values_list("pk", "position")
            ]
        return sorted(siblings, key=lambda sibling: (sibling[1], sibling[0].id))

    return Siblings(_lock_user(user), ordered)
