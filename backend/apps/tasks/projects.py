"""Business rules for Projects, Folders and the order the sidebar shows them in.

The sidebar has one top level, where Folders and ungrouped Projects share a single order, and one
order of Projects inside each Folder. Each of these sibling sets is ordered by fractional-indexing
keys the server generates: the client only says what an item now follows. Writes to a user's
sibling sets lock the user's row, so two concurrent moves never produce the same key.

The Inbox is a Project, but it stays out of every sibling set and can't be renamed, recoloured or
moved; Tasks services find it through `apps.tasks.services.inbox`.
"""

from __future__ import annotations

import secrets
from dataclasses import dataclass
from typing import TYPE_CHECKING

from django.db import IntegrityError, transaction
from django.db.models import Count
from django.utils import timezone

from apps.core.errors import DomainRuleError
from apps.core.palette import PaletteColor
from apps.tasks.archive import active_tasks
from apps.tasks.models import OPEN_STATUSES, Folder, Project
from apps.tasks.siblings import SiblingRef, sidebar_siblings

if TYPE_CHECKING:
    from django.db.models import QuerySet

    from apps.accounts.models import User


class ProjectRuleError(DomainRuleError):
    """A change to a Project breaks one of the rules Projects follow."""


INBOX_IS_FIXED = "The Inbox can't be renamed, recoloured or moved."
INBOX_HAS_NO_BOARD = "The Inbox has no Sections, so it can't be a Board."
INBOX_CANT_BE_ARCHIVED = "The Inbox can't be archived."


@dataclass(frozen=True)
class ProjectEdit:
    """The fields of a Project to change; a field left as None stays as it is."""

    name: str | None = None
    color: PaletteColor | None = None
    icon: Project.Icon | None = None
    layout: Project.Layout | None = None


@dataclass(frozen=True)
class Sidebar:
    """Everything the sidebar shows, read in a fixed number of queries.

    Archived Projects are left out of `items` and `folder_projects` and listed by name in
    `archived`; their Tasks don't count towards `open_counts`.
    """

    inbox: Project
    items: list[Folder | Project]
    folder_projects: dict[int, list[Project]]
    archived: list[Project]
    open_counts: dict[int, int]


def sidebar(user: User) -> Sidebar:
    """Return the user's Inbox, Folders and live Projects in sidebar order, with open counts."""
    projects = list(user.projects.filter(deleted_at__isnull=True).order_by("position", "id"))
    inbox = next(project for project in projects if project.is_inbox)
    folder_projects: dict[int, list[Project]] = {}
    ungrouped: list[Project] = []
    archived: list[Project] = []
    for project in projects:
        if project.is_inbox:
            continue
        if project.is_archived:
            archived.append(project)
            continue
        if project.folder_id is None:
            ungrouped.append(project)
        else:
            folder_projects.setdefault(project.folder_id, []).append(project)
    items: list[Folder | Project] = [*user.folders.all(), *ungrouped]
    items.sort(key=lambda item: (item.position, item.pk))
    archived.sort(key=lambda project: (project.name.lower(), project.pk))
    open_counts = dict(
        active_tasks(user)
        .filter(status__in=OPEN_STATUSES)
        .values("project")
        .annotate(count=Count("pk"))
        .values_list("project", "count"),
    )
    return Sidebar(
        inbox=inbox,
        items=items,
        folder_projects=folder_projects,
        archived=archived,
        open_counts=open_counts,
    )


def sidebar_items(user: User) -> list[Folder | Project]:
    """Return the sidebar's top level: Folders and ungrouped Projects in the user's order."""
    return sidebar(user).items


def folder_projects(folder: Folder) -> QuerySet[Project]:
    """Return the live Projects in a Folder, in the user's order."""
    return folder.projects.filter(deleted_at__isnull=True).order_by("position", "id")


def folder(user: User, folder_id: int) -> Folder | None:
    """Return one of the user's Folders, or None."""
    return user.folders.filter(pk=folder_id).first()


def _name_taken(name: str) -> ProjectRuleError:
    return ProjectRuleError(f"You already have a Project named “{name}”.")


def _save_project(project: Project, *, name: str) -> None:
    """Save the Project, turning a clash with another live Project's name into a rule error."""
    try:
        with transaction.atomic():
            project.save()
    except IntegrityError as error:
        raise _name_taken(name) from error


def _check_icon(icon: Project.Icon | None) -> None:
    if icon == Project.Icon.INBOX:
        msg = "That icon belongs to the Inbox."
        raise ProjectRuleError(msg)


def create_project(
    user: User,
    name: str,
    *,
    color: PaletteColor | None = None,
    icon: Project.Icon = Project.Icon.LIST,
    folder: Folder | None = None,
) -> Project:
    """Create a Project last in its Folder, or last in the sidebar; a random colour by default.

    Raises:
        ProjectRuleError: The name is taken or the icon is the Inbox's.
    """
    _check_icon(icon)
    with transaction.atomic():
        project = Project(
            owner=user,
            name=name,
            color=color or secrets.choice(PaletteColor.values),
            icon=icon,
            folder=folder,
            position=sidebar_siblings(user, folder).last(),
        )
        _save_project(project, name=name)
    return project


def update_project(user: User, project_id: int, edit: ProjectEdit) -> Project | None:
    """Change the given fields of one of the user's live Projects; None if it isn't theirs.

    Raises:
        ProjectRuleError: The Project is the Inbox, the name is taken or the icon is the Inbox's.
    """
    project = user.projects.filter(pk=project_id, deleted_at__isnull=True).first()
    if project is None:
        return None
    if project.is_inbox:
        board = edit.layout == Project.Layout.BOARD
        raise ProjectRuleError(INBOX_HAS_NO_BOARD if board else INBOX_IS_FIXED)
    _check_icon(edit.icon)
    project.name = edit.name if edit.name is not None else project.name
    project.color = edit.color or project.color
    project.icon = edit.icon or project.icon
    project.layout = edit.layout or project.layout
    _save_project(project, name=project.name)
    return project


def move_project(
    user: User,
    project_id: int,
    folder: Folder | None,
    after: SiblingRef | None,
) -> bool:
    """Put one of the user's Projects in a Folder (or the top level) right after `after`.

    No `after` puts it first; an `after` that isn't in the target sibling set puts it last.
    Returns False when the Project isn't the user's.

    Raises:
        ProjectRuleError: The Project is the Inbox.
    """
    project = user.projects.filter(pk=project_id, deleted_at__isnull=True).first()
    if project is None:
        return False
    if project.is_inbox:
        raise ProjectRuleError(INBOX_IS_FIXED)
    moving = SiblingRef("project", project.pk)
    if after == moving:
        return True
    with transaction.atomic():
        project.position = sidebar_siblings(user, folder).after(after, moving=moving)
        project.folder = folder
        project.save(update_fields=["position", "folder", "updated_at"])
    return True


def _set_archived(user: User, project_id: int, *, archived: bool) -> Project | None:
    project = user.projects.filter(pk=project_id, deleted_at__isnull=True).first()
    if project is None:
        return None
    if archived and project.is_inbox:
        raise ProjectRuleError(INBOX_CANT_BE_ARCHIVED)
    if archived != project.is_archived:
        project.archived_at = timezone.now() if archived else None
        project.save(update_fields=["archived_at", "updated_at"])
    return project


def archive_project(user: User, project_id: int) -> Project | None:
    """Archive one of the user's Projects; None if it isn't theirs. Archiving twice is harmless.

    It keeps its Folder and place, so unarchiving puts it back as it was.

    Raises:
        ProjectRuleError: The Project is the Inbox.
    """
    return _set_archived(user, project_id, archived=True)


def unarchive_project(user: User, project_id: int) -> Project | None:
    """Bring one of the user's archived Projects back where it was; None if it isn't theirs."""
    return _set_archived(user, project_id, archived=False)


def create_folder(user: User, name: str) -> Folder:
    """Create an expanded Folder last in the sidebar."""
    with transaction.atomic():
        position = sidebar_siblings(user, None).last()
        return Folder.objects.create(owner=user, name=name, position=position)


def update_folder(
    user: User,
    folder_id: int,
    *,
    name: str | None = None,
    collapsed: bool | None = None,
) -> Folder | None:
    """Rename, collapse or expand one of the user's Folders; None if it isn't theirs."""
    found = folder(user, folder_id)
    if found is None:
        return None
    found.name = name if name is not None else found.name
    found.collapsed = collapsed if collapsed is not None else found.collapsed
    found.save()
    return found


def move_folder(user: User, folder_id: int, after: SiblingRef | None) -> bool:
    """Put one of the user's Folders right after `after` on the sidebar's top level.

    No `after` puts it first; an `after` that isn't on the top level puts it last. Returns False
    when the Folder isn't the user's.
    """
    found = folder(user, folder_id)
    if found is None:
        return False
    moving = SiblingRef("folder", found.pk)
    if after == moving:
        return True
    with transaction.atomic():
        found.position = sidebar_siblings(user, None).after(after, moving=moving)
        found.save(update_fields=["position", "updated_at"])
    return True


def delete_folder(user: User, folder_id: int) -> bool:
    """Delete one of the user's Folders, leaving its Projects ungrouped in its place.

    Returns False when the Folder isn't the user's. A Folder holds only Projects, never Tasks,
    so it is deleted for good rather than sent to Trash.
    """
    found = folder(user, folder_id)
    if found is None:
        return False
    with transaction.atomic():
        # Trashed Projects are ungrouped too, so a restore never points at a missing Folder.
        projects = list(found.projects.order_by("position", "id"))
        top_level = sidebar_siblings(user, None)
        keys = top_level.keys_after(SiblingRef("folder", found.pk), len(projects))
        for project, key in zip(projects, keys, strict=True):
            project.folder = None
            project.position = key
        Project.objects.bulk_update(projects, ["folder", "position"])
        found.delete()
    return True
