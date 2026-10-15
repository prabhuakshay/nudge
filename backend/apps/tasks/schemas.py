"""Request and response shapes for the Task, Activity, Project, Folder and sidebar endpoints."""

from __future__ import annotations

from datetime import datetime  # noqa: TC003 - Pydantic needs the type at runtime
from typing import Annotated, Literal

from ninja import Field, Schema
from pydantic import StringConstraints

from apps.core.palette import PaletteColor  # noqa: TC001 - Pydantic needs the type at runtime
from apps.tasks.models import Project, Task

Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=64)]


class TaskOut(Schema):
    """A Task as a list row shows it."""

    id: int
    project_id: int
    title: str
    status: Task.Status
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime


class TaskDetailOut(TaskOut):
    """A Task as the detail drawer shows it."""

    description: str = Field(description="Markdown, as the user wrote it.")


class TaskListOut(Schema):
    """Tasks for a list, and the cursor for the next page when the list is paginated."""

    items: list[TaskOut]
    next_cursor: str | None = Field(
        description="Pass as `cursor` to get the next page; null on the last page.",
    )


class TaskIn(Schema):
    """A new Task from Quick add."""

    title: Title
    project_id: int | None = Field(default=None, description="Defaults to the Inbox.")


class TaskPatchIn(Schema):
    """The fields of a Task to change; fields left out stay as they are."""

    title: Title | None = None
    description: str | None = Field(default=None, description="Markdown.")
    status: Task.Status | None = None
    project_id: int | None = Field(default=None, description="Moves the Task first into it.")


class AffectedTaskOut(Schema):
    """A Task whose Status a change touched, with its Status before, so the client can undo."""

    id: int
    prior_status: Task.Status


class TaskChangeOut(Schema):
    """A changed Task and every Task whose Status the change touched."""

    task: TaskDetailOut
    affected: list[AffectedTaskOut]


class NoActivityData(Schema):
    """The details of an event whose kind says it all."""


class TitleChangedData(Schema):
    """The title before and after a rename."""

    old: str
    new: str


class CreatedActivityOut(Schema):
    """The Task was created."""

    id: int
    kind: Literal["created"]
    at: datetime
    data: NoActivityData


class TitleChangedActivityOut(Schema):
    """The Task was renamed."""

    id: int
    kind: Literal["title_changed"]
    at: datetime
    data: TitleChangedData


class DescriptionEditedActivityOut(Schema):
    """The Task's Description was edited. The edit itself isn't kept."""

    id: int
    kind: Literal["description_edited"]
    at: datetime
    data: NoActivityData


class MovedData(Schema):
    """The Projects a Task moved between, by their names at the time."""

    from_project: str
    to_project: str


class MovedActivityOut(Schema):
    """The Task moved to another Project."""

    id: int
    kind: Literal["moved"]
    at: datetime
    data: MovedData


TaskActivityOut = Annotated[
    CreatedActivityOut | TitleChangedActivityOut | DescriptionEditedActivityOut | MovedActivityOut,
    Field(discriminator="kind"),
]


class TaskActivityListOut(Schema):
    """A page of a Task's history, newest first."""

    items: list[TaskActivityOut]
    next_cursor: str | None = Field(
        description="Pass as `cursor` to get the next page; null on the last page.",
    )
    count: int = Field(description="How many events the whole history holds.")


class ProjectOut(Schema):
    """A Project's own fields."""

    id: int
    name: str
    color: PaletteColor
    icon: Project.Icon
    folder_id: int | None
    is_inbox: bool


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
