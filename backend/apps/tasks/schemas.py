"""Request and response shapes for the endpoints of the tasks app."""

from __future__ import annotations

from datetime import date, datetime, time
from typing import Annotated, Literal, Self

from ninja import Field, Schema
from pydantic import StringConstraints, field_validator, model_validator

from apps.core.palette import PaletteColor  # noqa: TC001 - Pydantic needs the type at runtime
from apps.tasks.models import Project, Task
from apps.tasks.schedule import View  # noqa: TC001 - Pydantic needs the type at runtime

Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]
BlockedReason = Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=64)]
# These characters would break a Mention token, `[@Name](person:<id>)`, written around the name.
PersonName = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        min_length=1,
        max_length=64,
        pattern=r"^[^@\[\]()]+$",
    ),
]


class TaskOut(Schema):
    """A Task as a list row shows it. Rows are flat; clients build the tree from `parent_id`."""

    id: int
    project_id: int
    parent_id: int | None = Field(description="Null for a root Task.")
    position: str = Field(description="Sorts the Task among its siblings, byte by byte.")
    depth: int = Field(description="0 for a root Task, up to 3 for the deepest Subtask.")
    parent_title: str | None = Field(description="The parent's title, for a breadcrumb.")
    title: str
    status: Task.Status
    priority: Task.Priority = Field(description="0 is no Priority; 1 (P1) is the most urgent.")
    blocked_reason: str = Field(description="Why a Blocked Task waits; empty otherwise.")
    completed_at: datetime | None = Field(description="When it was Completed or marked Won't do.")
    pinned_at: datetime | None = Field(description="When it was pinned; null when it isn't.")
    due_date: date | None
    due_time: time | None = Field(description="Null for an all-day Task.")
    start_date: date | None = Field(description="Set for a range, which ends on the due date.")
    start_time: time | None
    is_overdue: bool = Field(
        description="Whether the Task is open and its due date or time has passed in the user's "
        "time zone. A range is overdue only once its end has passed.",
    )
    created_at: datetime
    updated_at: datetime
    attachment_count: int = Field(
        default=0,
        description="How many Attachments the Task has. A Task just added has none.",
    )


class TaskAncestorOut(Schema):
    """A Task above another in the tree, as a breadcrumb links to it."""

    id: int
    title: str


class TaskDetailOut(TaskOut):
    """A Task as the detail drawer shows it, with where it sits in the tree and what's under it."""

    description: str = Field(description="Markdown, as the user wrote it.")
    ancestors: list[TaskAncestorOut] = Field(description="From the root down to the parent.")
    subtasks: list[TaskOut] = Field(
        description="Every Subtask below, whatever its Status, as flat rows in manual order.",
    )


class TaskListQuery(Schema):
    """Which Tasks to list: one Project's, one Person's or one view's, open or Closed."""

    project: int | None = None
    person: int | None = None
    view: View | None = Field(default=None, description="Today or Upcoming, picked by date.")
    closed: bool = Field(default=False, description="List Closed Tasks, a page at a time.")
    cursor: str | None = Field(default=None, description="From the previous page of Closed ones.")

    @model_validator(mode="after")
    def _at_most_one_source(self) -> Self:
        if sum(source is not None for source in (self.project, self.person, self.view)) > 1:
            message = "Give only one of project, person or view."
            raise ValueError(message)
        return self


class TaskListOut(Schema):
    """Tasks for a list, and the cursor for the next page when the list is paginated."""

    items: list[TaskOut]
    next_cursor: str | None = Field(
        description="Pass as `cursor` to get the next page; null on the last page.",
    )


class TaskDatesIn(Schema):
    """A Task's due date, time and range, all clock times in the user's time zone.

    Without a time the Task is all-day. A start turns it into a range ending at the due date;
    start and due are then both all-day or both timed. Times have minute precision.
    """

    due_date: date
    due_time: time | None = None
    start_date: date | None = None
    start_time: time | None = None

    @field_validator("due_time", "start_time")
    @classmethod
    def _whole_minutes(cls, value: time | None) -> time | None:
        if value is not None and (value.second or value.microsecond):
            message = "Times have minute precision."
            raise ValueError(message)
        return value

    @model_validator(mode="after")
    def _a_valid_range(self) -> Self:
        if self.start_date is None:
            if self.start_time is not None:
                message = "A start time needs a start date."
                raise ValueError(message)
            return self
        if (self.start_time is None) != (self.due_time is None):
            message = "A range's start and due are both all-day or both timed."
            raise ValueError(message)
        if (self.start_date, self.start_time or time.min) > (
            self.due_date,
            self.due_time or time.min,
        ):
            message = "A range can't start after it's due."
            raise ValueError(message)
        return self


class TaskIn(Schema):
    """A new Task from Quick add."""

    title: Title
    project_id: int | None = Field(
        default=None,
        description="Defaults to the Inbox. Ignored for a Subtask, which joins its parent's.",
    )
    parent_id: int | None = Field(
        default=None,
        description="Makes the Task the last Subtask of this one; reopens it if it's Closed.",
    )
    dates: TaskDatesIn | None = Field(
        default=None,
        description="Dates the Task from the start, such as today in Today. Not for a Subtask.",
    )


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
    pinned: bool | None = Field(
        default=None,
        description="Pin the Task to the top of its lists, or unpin it.",
    )
    dates: TaskDatesIn | None = Field(
        default=None,
        description="Replaces all of the Task's dates; null removes them.",
    )
    project_id: int | None = Field(default=None, description="Moves the Task first into it.")


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
    | PersonMergedActivityOut,
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


class PersonOut(Schema):
    """A Person in the user's address book."""

    id: int
    name: str
    color: PaletteColor


class PersonIn(Schema):
    """A new Person."""

    name: PersonName = Field(description="Unique among the user's People, ignoring case.")
    color: PaletteColor | None = Field(default=None, description="Random when left out.")


class PersonPatchIn(Schema):
    """The fields of a Person to change; fields left out stay as they are."""

    name: PersonName | None = Field(default=None, description="Rewrites every Mention.")
    color: PaletteColor | None = None


class PersonMergeIn(Schema):
    """The Person to fold another into."""

    into_id: int
