"""Response shapes for a Task's Activity history, one per kind of event."""

from __future__ import annotations

from datetime import date, datetime, time  # noqa: TC003 - Pydantic needs the types at runtime
from typing import Annotated, Literal

from ninja import Field, Schema

from apps.tasks.models import Task  # noqa: TC001 - Pydantic needs the type at runtime
from apps.tasks.schemas.tags import (
    TagAddedActivityOut,
    TagRemovedActivityOut,
    TagsMergedActivityOut,
)


class NoActivityData(Schema):
    """The details of an event whose kind says it all."""


class TitleChangedData(Schema):
    """The title before and after a rename."""

    old: str
    new: str


class DatesData(Schema):
    """A Task's dates at one moment, as a change recorded them."""

    due_date: date
    due_time: time | None
    start_date: date | None
    start_time: time | None


class DatesChangedData(Schema):
    """The dates before and after a change; null when the Task had or has none."""

    old: DatesData | None
    new: DatesData | None


class StatusChangedData(Schema):
    """The Status before and after a change, the Blocked reason it was given, and any cascade.

    A change the user made to a relative names that relative: `via_parent` when closing a
    parent closed this Task, `via_subtask` when reopening a Subtask reopened it.
    """

    old: Task.Status
    new: Task.Status
    blocked_reason: str
    via_parent: str | None = Field(default=None, description="The Closed parent's title.")
    via_subtask: str | None = Field(default=None, description="The reopened Subtask's title.")
    closed_subtasks: int = Field(default=0, description="How many Subtasks closed with it.")


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


class DatesChangedActivityOut(Schema):
    """The Task's due date, time or range was set, changed or removed."""

    id: int
    kind: Literal["dates_changed"]
    at: datetime
    data: DatesChangedData


class MovedData(Schema):
    """The Projects a Task moved between, by their names at the time."""

    from_project: str
    to_project: str


class PersonMergedData(Schema):
    """The People merged, by their names at the time: `from_person` was folded into `to_person`."""

    from_person: str
    to_person: str


class PersonMergedActivityOut(Schema):
    """A Person the Task mentioned was merged into another."""

    id: int
    kind: Literal["person_merged"]
    at: datetime
    data: PersonMergedData


class MovedActivityOut(Schema):
    """The Task moved to another Project."""

    id: int
    kind: Literal["moved"]
    at: datetime
    data: MovedData


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


class PinnedActivityOut(Schema):
    """The Task was pinned."""

    id: int
    kind: Literal["pinned"]
    at: datetime
    data: NoActivityData


class UnpinnedActivityOut(Schema):
    """The Task was unpinned."""

    id: int
    kind: Literal["unpinned"]
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
    | StatusChangedActivityOut
    | PriorityChangedActivityOut
    | PinnedActivityOut
    | UnpinnedActivityOut
    | AttachmentAddedActivityOut
    | AttachmentRemovedActivityOut
    | DatesChangedActivityOut
    | MovedActivityOut
    | PersonMergedActivityOut
    | TagAddedActivityOut
    | TagRemovedActivityOut
    | TagsMergedActivityOut,
    Field(discriminator="kind"),
]


class TaskActivityListOut(Schema):
    """A page of a Task's history, newest first."""

    items: list[TaskActivityOut]
    next_cursor: str | None = Field(
        description="Pass as `cursor` to get the next page; null on the last page.",
    )
    count: int = Field(description="How many events the whole history holds.")
