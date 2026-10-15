"""Response shapes for the Trash endpoints."""

from __future__ import annotations

from datetime import datetime  # noqa: TC003 - Pydantic needs the type at runtime

from ninja import Field, Schema

from apps.tasks.schemas.projects import ProjectOut  # noqa: TC001 - Pydantic needs the type
from apps.tasks.schemas.tasks import TaskOut  # noqa: TC001 - Pydantic needs the type at runtime


class TrashedTaskOut(Schema):
    """One Trash unit: a deleted Task, with the Subtasks that went with it counted."""

    id: int
    title: str
    project_name: str = Field(description="The Project it was deleted from.")
    subtask_count: int = Field(description="How many Subtasks went to Trash with it.")
    deleted_at: datetime
    expires_at: datetime = Field(description="When it will be deleted for good.")


class TaskRestoreOut(Schema):
    """A Task back from Trash, and the Project it went back to, which may be the Inbox."""

    task: TaskOut
    project: ProjectOut
