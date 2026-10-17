"""Ordered sibling sets: the one place that knows which rows share an order and hands out keys.

Every ordered thing in Nudge sorts by a fractional-indexing `position` key among its siblings.
A sibling set knows its scope (which rows share the order), the row it locks so two writers never
hand out the same key, and its tie-break, and answers where a row goes: first, last, after
another, back where it was, or who it follows.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Literal

from django.db.models import Q, Subquery
from fractional_indexing import generate_key_between, generate_n_keys_between

from apps.accounts.models import User
from apps.tasks import live
from apps.tasks.models import Project, Section, Tag, Task

if TYPE_CHECKING:
    from collections.abc import Callable

    from django.db.models import Model, QuerySet

    from apps.tasks.models import Folder


@dataclass(frozen=True)
class Siblings[Ref]:
    """An ordered set of siblings, each named by a reference such as its id.

    Every method that returns a key locks the set first, so call it inside a transaction.

    Attributes:
        lock: Takes the set's lock alone, for a write that reads the rows it moves before asking
            for their keys, or for a row that comes back to its own key.
        ordered: Returns the siblings as (reference, key) pairs in order. It takes no lock.
        before: Returns the sibling right before a row, or None when it's first. It takes no lock.
    """

    lock: Callable[[], None]
    ordered: Callable[[], list[tuple[Ref, str]]]
    before: Callable[[Ref], Ref | None]

    def _locked(self, moving: Ref | None = None) -> list[tuple[Ref, str]]:
        """Lock the set and return its siblings in order, leaving out the row being placed."""
        self.lock()
        return [(ref, key) for ref, key in self.ordered() if ref != moving]

    def first(self) -> str:
        """Return a key before every sibling."""
        return self.after(None)

    def last(self) -> str:
        """Return a key after every sibling."""
        siblings = self._locked()
        return _key_after(siblings, siblings[-1][0] if siblings else None)

    def after(self, ref: Ref | None, moving: Ref | None = None) -> str:
        """Return a key right after `ref`: first for None, last when `ref` isn't a sibling.

        `moving` is the row being placed, if it's already in the set. Siblings that share `ref`'s
        key can't be split, so the key goes after all of them.
        """
        return _key_after(self._locked(moving), ref)

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
        return _key_after(siblings, clash)


def _key_after[Ref](siblings: list[tuple[Ref, str]], ref: Ref | None) -> str:
    """Return a key right after `ref` among `siblings`, as `Siblings.after` places one."""
    return str(generate_key_between(*_gap_after(siblings, ref)))


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


def _row_lock(row: QuerySet[Model]) -> Callable[[], None]:
    """Return a lock on the one row `row` selects, which every write to the set takes."""

    def lock() -> None:
        row.select_for_update().get()

    return lock


def _by_key[Row: (Task, Section, Tag)](
    lock: Callable[[], None],
    rows: QuerySet[Row],
) -> Siblings[int]:
    """Return `rows` as a set ordered by key and then id, named by their ids."""

    def ordered() -> list[tuple[int, str]]:
        return list(rows.order_by("position", "id").values_list("pk", "position"))

    def before(ref: int) -> int | None:
        # Bulk undo asks this once per Task, so it reads one row rather than the whole set.
        key = Subquery(rows.filter(pk=ref).values("position")[:1])
        earlier = rows.filter(Q(position__lt=key) | Q(position=key, pk__lt=ref))
        return earlier.order_by("-position", "-id").values_list("pk", flat=True).first()

    return Siblings(lock=lock, ordered=ordered, before=before)


def task_siblings(project_id: int, parent_id: int | None) -> Siblings[int]:
    """Return a Project's root Tasks, or a Task's Subtasks, ordered by key and then id.

    Trashed Tasks keep their place, so they stay in the set. Writes lock the Project.
    """
    rows = Task.objects.filter(project_id=project_id, parent_id=parent_id)
    return _by_key(_row_lock(Project.objects.filter(pk=project_id)), rows)


def section_siblings(project_id: int) -> Siblings[int]:
    """Return a Project's Sections, ordered by key and then id. Writes lock the Project."""
    rows = Section.objects.filter(project_id=project_id)
    return _by_key(_row_lock(Project.objects.filter(pk=project_id)), rows)


def tag_siblings(user: User) -> Siblings[int]:
    """Return the user's Tags, ordered by key and then id. Writes lock the user."""
    return _by_key(_row_lock(User.objects.filter(pk=user.pk)), user.tags.all())


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

    return Siblings(lock=_row_lock(User.objects.filter(pk=user.pk)), ordered=ordered, before=before)
