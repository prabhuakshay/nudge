"""Request and response shapes for the Project, Folder and sidebar endpoints."""

from __future__ import annotations

from typing import Annotated, Literal

from ninja import Field, Schema
from pydantic import StringConstraints

from apps.core.palette import PaletteColor  # noqa: TC001 - Pydantic needs the type at runtime
from apps.tasks.models import Project
from apps.tasks.schemas.tags import SidebarTagOut  # noqa: TC001 - Pydantic needs the type at runtime

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=64)]


class ProjectOut(Schema):
    """A Project's own fields."""

    id: int
    name: str
    color: PaletteColor
    icon: Project.Icon
    folder_id: int | None
    is_inbox: bool
    is_archived: bool = Field(description="Archived Projects are read-only.")


class ProjectIn(Schema):
    """A new Project."""

    name: Name
    color: PaletteColor | None = Field(default=None, description="Random when left out.")
    icon: Project.Icon = Project.Icon.LIST
    folder_id: int | None = Field(default=None, description="Ungrouped when left out.")


class ProjectPatchIn(Schema):
    """The fields of a Project to change; fields left out stay as they are."""

    name: Name | None = None
    color: PaletteColor | None = None
    icon: Project.Icon | None = None


class FolderOut(Schema):
    """A Folder's own fields."""

    id: int
    name: str
    collapsed: bool


class FolderIn(Schema):
    """A new Folder."""

    name: Name


class FolderPatchIn(Schema):
    """The fields of a Folder to change; fields left out stay as they are."""

    name: Name | None = None
    collapsed: bool | None = None


class SiblingIn(Schema):
    """A Folder or Project in the sidebar. Both kinds share the top level's order."""

    kind: Literal["folder", "project"]
    id: int


class FolderMoveIn(Schema):
    """Where a Folder goes on the sidebar's top level."""

    after: SiblingIn | None = Field(
        default=None,
        description="The item it now follows; first when left out, last when it isn't there.",
    )


class ProjectMoveIn(FolderMoveIn):
    """Where a Project goes: into a Folder or onto the top level, after a sibling."""

    folder_id: int | None = Field(default=None, description="The top level when left out.")


class SidebarProjectOut(ProjectOut):
    """A Project as the sidebar lists it."""

    kind: Literal["project"]
    open_count: int


class SidebarFolderOut(FolderOut):
    """A Folder as the sidebar lists it, with its Projects in order."""

    kind: Literal["folder"]
    projects: list[SidebarProjectOut]


class SidebarOut(Schema):
    """Everything the sidebar shows."""

    inbox: SidebarProjectOut
    items: list[Annotated[SidebarFolderOut | SidebarProjectOut, Field(discriminator="kind")]] = (
        Field(description="Folders and ungrouped Projects in the user's order.")
    )
    archived: list[SidebarProjectOut] = Field(description="Archived Projects, by name.")
    today_count: int = Field(description="Open Tasks in Today, Overdue ones included.")
    upcoming_count: int = Field(description="Open Tasks in Upcoming.")
    tags: list[SidebarTagOut] = Field(description="In the user's order.")
