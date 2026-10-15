"""Request and response shapes for the Task, Activity and sidebar endpoints."""

from __future__ import annotations

from datetime import datetime  # noqa: TC003 - Pydantic needs the type at runtime
from typing import Annotated, Literal

from ninja import Field, Schema
from pydantic import StringConstraints

from apps.tasks.models import Task  # noqa: TC001 - Pydantic needs the type at runtime

Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]
BlockedReason = Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)]


class TaskOut(Schema):
    """A Task as a list row shows it."""

    id: int
    project_id: int
    title: str
    status: Task.Status
    priority: Task.Priority = Field(description="0 is no Priority; 1 (P1) is the most urgent.")
    blocked_reason: str = Field(description="Why a Blocked Task waits; empty otherwise.")
    completed_at: datetime | None = Field(description="When it was Completed or marked Won't do.")
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
    status: Task.Status | None = Field(
        default=None,
        description="Changing it clears the Blocked reason unless one is given with it.",
    )
    blocked_reason: BlockedReason | None = Field(
        default=None,
        description="Only a Blocked Task can have one; send an empty string to clear it.",
    )
    priority: Task.Priority | None = None


class AffectedTaskOut(Schema):
    """A Task whose Status a change touched, with its Status before, so the client can undo."""

    id: int
    prior_status: Task.Status
    prior_blocked_reason: str


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


class StatusChangedData(Schema):
    """The Status before and after a change, and the Blocked reason it was given, if any."""

    old: Task.Status
    new: Task.Status
    blocked_reason: str


class PriorityChangedData(Schema):
    """The Priority before and after a change."""

    old: Task.Priority
    new: Task.Priority


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


class StatusChangedActivityOut(Schema):
    """The Task's Status changed."""

    id: int
    kind: Literal["status_changed"]
    at: datetime
    data: StatusChangedData


class PriorityChangedActivityOut(Schema):
    """The Task's Priority changed."""

    id: int
    kind: Literal["priority_changed"]
    at: datetime
    data: PriorityChangedData


TaskActivityOut = Annotated[
    CreatedActivityOut
    | TitleChangedActivityOut
    | DescriptionEditedActivityOut
    | StatusChangedActivityOut
    | PriorityChangedActivityOut,
    Field(discriminator="kind"),
]


class TaskActivityListOut(Schema):
    """A page of a Task's history, newest first."""

    items: list[TaskActivityOut]
    next_cursor: str | None = Field(
        description="Pass as `cursor` to get the next page; null on the last page.",
    )
    count: int = Field(description="How many events the whole history holds.")


class SidebarProjectOut(Schema):
    """A Project as the sidebar lists it."""

    id: int
    name: str
    open_count: int


class SidebarOut(Schema):
    """Everything the sidebar shows."""

    inbox: SidebarProjectOut
