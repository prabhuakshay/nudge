"""Response shapes for the Trash endpoints."""

from __future__ import annotations

from datetime import datetime  # noqa: TC003 - Pydantic needs the type at runtime
from typing import Annotated, Literal, Self

from ninja import Field, Schema
from pydantic import model_validator

from apps.core.palette import PaletteColor  # noqa: TC001 - Pydantic needs the type at runtime
from apps.tasks.models import Project  # noqa: TC001 - Pydantic needs the type at runtime
from apps.tasks.schemas.projects import ProjectOut  # noqa: TC001 - Pydantic needs the type
from apps.tasks.schemas.tasks import TaskOut  # noqa: TC001 - Pydantic needs the type at runtime


class TrashedTaskOut(Schema):
    """One Trash unit: a deleted Task, with the Subtasks that went with it counted."""

    kind: Literal["task"] = "task"
    id: int
    title: str
    project_name: str = Field(description="The Project it was deleted from.")
    subtask_count: int = Field(description="How many Subtasks went to Trash with it.")
    deleted_at: datetime
    expires_at: datetime = Field(description="When it will be deleted for good.")


class TrashedProjectOut(Schema):
    """One Trash unit: a deleted Project, with the Tasks that went with it counted."""

    kind: Literal["project"] = "project"
    id: int
    name: str
    color: PaletteColor
    icon: Project.Icon
    task_count: int = Field(description="How many Tasks went to Trash with it.")
    deleted_at: datetime
    expires_at: datetime = Field(description="When it will be deleted for good.")


TrashedOut = Annotated[TrashedTaskOut | TrashedProjectOut, Field(discriminator="kind")]


class TaskRestoreOut(Schema):
    """A Task back from Trash, and the Project it went back to, which may be the Inbox."""

    task: TaskOut
    project: ProjectOut


class TrashDeleteIn(Schema):
    """The trashed Tasks and Projects whose units to delete for good; at least one id."""

    task_ids: list[int] = Field(
        default=[],
        description="Trashed Tasks; each takes the whole unit it went to Trash with.",
    )
    project_ids: list[int] = Field(
        default=[],
        description="Trashed Projects; each takes the Tasks that went to Trash with it.",
    )

    @model_validator(mode="after")
    def _names_something(self) -> Self:
        if not self.task_ids and not self.project_ids:
            msg = "Give at least one Task or Project id."
            raise ValueError(msg)
        return self
