"""Ordered sibling sets: the one place that knows which rows share an order and hands out keys.

Every ordered thing in Nudge sorts by a fractional-indexing `position` key among its siblings.
A sibling set knows its scope (which rows share the order), the row it locks so two writers never
hand out the same key, and its tie-break, and answers where a row goes: first, last, after
another, back where it was, or who it follows. Each app builds the sets for its own models.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from django.db.models import Model, Q, Subquery
from fractional_indexing import generate_key_between, generate_n_keys_between

if TYPE_CHECKING:
    from collections.abc import Callable

    from django.db.models import QuerySet


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


def row_lock(row: QuerySet[Model]) -> Callable[[], None]:
    """Return a lock on the one row `row` selects, which every write to the set takes."""

    def lock() -> None:
        row.select_for_update().get()

    return lock


def by_key[Row: Model](
    lock: Callable[[], None],
    rows: QuerySet[Row],
) -> Siblings[int]:
    """Return `rows` as a set ordered by key and then id, named by their ids."""

    def ordered() -> list[tuple[int, str]]:
        return list(rows.order_by("position", "id").values_list("pk", "position"))

    def before(ref: int) -> int | None:
        # Bulk undo asks this once per row, so it reads one row rather than the whole set.
        key = Subquery(rows.filter(pk=ref).values("position")[:1])
        earlier = rows.filter(Q(position__lt=key) | Q(position=key, pk__lt=ref))
        return earlier.order_by("-position", "-id").values_list("pk", flat=True).first()

    return Siblings(lock=lock, ordered=ordered, before=before)
