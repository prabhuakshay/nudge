"""Order keys in a Project: locking its sibling sets, and the key that puts a Task first."""

from __future__ import annotations

from fractional_indexing import generate_key_between

from apps.tasks.models import Project


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
