"""Request and response shapes for the Task and sidebar endpoints."""

from __future__ import annotations

from datetime import datetime  # noqa: TC003 - Pydantic needs the type at runtime
from typing import Annotated

from ninja import Field, Schema
from pydantic import StringConstraints

from apps.tasks.models import Task  # noqa: TC001 - Pydantic needs the type at runtime

Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]


class TaskOut(Schema):
    """A Task as a list row shows it."""

    id: int
    project_id: int
    title: str
    status: Task.Status
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime


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

    status: Task.Status | None = None


class AffectedTaskOut(Schema):
    """A Task whose Status a change touched, with its Status before, so the client can undo."""

    id: int
    prior_status: Task.Status


class TaskChangeOut(Schema):
    """A changed Task and every Task whose Status the change touched."""

    task: TaskOut
    affected: list[AffectedTaskOut]


class SidebarProjectOut(Schema):
    """A Project as the sidebar lists it."""

    id: int
    name: str
    open_count: int


class SidebarOut(Schema):
    """Everything the sidebar shows."""

    inbox: SidebarProjectOut
