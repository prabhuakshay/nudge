"""Request and response shapes for the Task, Attachment, Activity and sidebar endpoints."""

from __future__ import annotations

from datetime import datetime  # noqa: TC003 - Pydantic needs the type at runtime
from typing import Annotated, Literal

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
    attachment_count: int = Field(
        default=0,
        description="How many Attachments the Task has. A Task just added has none.",
    )


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


class AttachmentData(Schema):
    """The Attachment an event is about, by the name it had."""

    name: str


class AttachmentAddedActivityOut(Schema):
    """A file was attached to the Task."""

    id: int
    kind: Literal["attachment_added"]
    at: datetime
    data: AttachmentData


class AttachmentRemovedActivityOut(Schema):
    """An Attachment was deleted from the Task."""

    id: int
    kind: Literal["attachment_removed"]
    at: datetime
    data: AttachmentData


TaskActivityOut = Annotated[
    CreatedActivityOut
    | TitleChangedActivityOut
    | DescriptionEditedActivityOut
    | AttachmentAddedActivityOut
    | AttachmentRemovedActivityOut,
    Field(discriminator="kind"),
]


class TaskActivityListOut(Schema):
    """A page of a Task's history, newest first."""

    items: list[TaskActivityOut]
    next_cursor: str | None = Field(
        description="Pass as `cursor` to get the next page; null on the last page.",
    )
    count: int = Field(description="How many events the whole history holds.")


class AttachmentOut(Schema):
    """A file attached to a Task. Its bytes come from the download endpoint."""

    id: int
    name: str = Field(description="The file's name as it was uploaded.")
    size: int = Field(description="In bytes.")
    content_type: str = Field(description="Chosen by the server from the file's name.")
    created_at: datetime


class SidebarProjectOut(Schema):
    """A Project as the sidebar lists it."""

    id: int
    name: str
    open_count: int


class SidebarOut(Schema):
    """Everything the sidebar shows."""

    inbox: SidebarProjectOut
