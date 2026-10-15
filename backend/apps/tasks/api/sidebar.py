"""The sidebar endpoint: everything the sidebar lists, in one request."""

from __future__ import annotations

from typing import TYPE_CHECKING

from ninja import Router

from apps.core.palette import PaletteColor
from apps.tasks import projects, tags
from apps.tasks.api import signed_in_user
from apps.tasks.models import Folder, Project
from apps.tasks.schemas import SidebarFolderOut, SidebarOut, SidebarProjectOut
from apps.tasks.tag_schemas import SidebarTagOut

if TYPE_CHECKING:
    from django.http import HttpRequest

router = Router()


def _project_out(project: Project, sidebar: projects.Sidebar) -> SidebarProjectOut:
    return SidebarProjectOut(
        kind="project",
        id=project.pk,
        name=project.name,
        color=PaletteColor(project.color),
        icon=Project.Icon(project.icon),
        folder_id=project.folder_id,
        is_inbox=project.is_inbox,
        is_archived=project.is_archived,
        open_count=sidebar.open_counts.get(project.pk, 0),
    )


def _item_out(
    item: Folder | Project,
    sidebar: projects.Sidebar,
) -> SidebarFolderOut | SidebarProjectOut:
    if isinstance(item, Project):
        return _project_out(item, sidebar)
    return SidebarFolderOut(
        kind="folder",
        id=item.pk,
        name=item.name,
        collapsed=item.collapsed,
        projects=[_project_out(p, sidebar) for p in sidebar.folder_projects.get(item.pk, [])],
    )


def _tag_out(found: tags.SidebarTag) -> SidebarTagOut:
    return SidebarTagOut(
        id=found.tag.pk,
        name=found.tag.name,
        color=PaletteColor(found.tag.color) if found.tag.color else None,
        open_count=found.open_count,
        task_count=found.task_count,
    )


@router.get("", response=SidebarOut, summary="Get the sidebar")
def sidebar(request: HttpRequest) -> SidebarOut:
    """Return the Inbox, Folders and ungrouped Projects in order, archived Projects, then Tags."""
    user = signed_in_user(request)
    found = projects.sidebar(user)
    return SidebarOut(
        inbox=_project_out(found.inbox, found),
        items=[_item_out(item, found) for item in found.items],
        archived=[_project_out(project, found) for project in found.archived],
        tags=[_tag_out(found) for found in tags.sidebar_tags(user)],
    )
