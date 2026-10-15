"""The sidebar endpoint: everything the sidebar lists, in one request."""

from __future__ import annotations

from typing import TYPE_CHECKING

from ninja import Router

from apps.core.palette import PaletteColor
from apps.tasks import projects
from apps.tasks.api import signed_in_user
from apps.tasks.models import Folder, Project
from apps.tasks.schemas.projects import SidebarFolderOut, SidebarOut, SidebarProjectOut

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


@router.get("", response=SidebarOut, summary="Get the sidebar")
def sidebar(request: HttpRequest) -> SidebarOut:
    """Return the Inbox, Folders and ungrouped Projects in order, then archived Projects."""
    found = projects.sidebar(signed_in_user(request))
    return SidebarOut(
        inbox=_project_out(found.inbox, found),
        items=[_item_out(item, found) for item in found.items],
        archived=[_project_out(project, found) for project in found.archived],
    )
