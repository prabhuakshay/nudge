"""Order keys: placing a row among its siblings, and locking a Project's sibling sets."""

from __future__ import annotations

from typing import TYPE_CHECKING

from fractional_indexing import generate_key_between

from apps.tasks.models import Project

if TYPE_CHECKING:
    from collections.abc import Sequence


def key_after[Ref](siblings: Sequence[tuple[Ref, str]], after: Ref | None) -> str:
    """Return a key right after `after`, first for None, or last when `after` isn't a sibling.

    `siblings` are (reference, key) pairs in order; the row being placed must not be among them.
    """
    refs = [ref for ref, _ in siblings]
    keys = [key for _, key in siblings]
    if after is None:
        return str(generate_key_between(None, keys[0] if keys else None))
    if after not in refs:
        return str(generate_key_between(keys[-1] if keys else None, None))
    index = refs.index(after)
    following = keys[index + 1] if index + 1 < len(keys) else None
    return str(generate_key_between(keys[index], following))


def lock_project(project_id: int) -> None:
    """Lock the Project's row until the transaction ends. Call it inside one.

    Locking the Project serialises writes to its sibling sets, so two Tasks never get the same key.
    """
    Project.objects.select_for_update().get(pk=project_id)


def first_root_position(project: Project) -> str:
    """Lock the Project and return a key before all its root Tasks. Call it in a transaction."""
    lock_project(project.pk)
    roots = project.tasks.filter(parent__isnull=True).order_by("position", "id")
    first = roots.values_list("position", flat=True).first()
    return str(generate_key_between(None, first))


def last_root_position(project: Project) -> str:
    """Lock the Project and return a key after all its root Tasks. Call it in a transaction."""
    lock_project(project.pk)
    roots = project.tasks.filter(parent__isnull=True).order_by("-position", "-id")
    last = roots.values_list("position", flat=True).first()
    return str(generate_key_between(last, None))
