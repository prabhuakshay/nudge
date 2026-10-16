"""Request and response shapes for the Task endpoints."""

from __future__ import annotations

from datetime import date, datetime, time
from typing import Annotated, Self

from ninja import Field, Schema
from pydantic import StringConstraints, field_validator, model_validator

from apps.tasks.models import Task  # noqa: TC001 - Pydantic needs the type at runtime
from apps.tasks.schedule import View  # noqa: TC001 - Pydantic needs the type at runtime
from apps.tasks.schemas.reminders import (  # noqa: TC001 - Pydantic needs the types at runtime
    ReminderOffset,
    ReminderOut,
)
from apps.tasks.schemas.tags import TagName, TagOut  # noqa: TC001 - Pydantic needs it at runtime

Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]
RepeatRule = Annotated[str, StringConstraints(max_length=500)]
BlockedReason = Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)]


class TaskOut(Schema):
    """A Task as a list row shows it. Rows are flat; clients build the tree from `parent_id`."""

    id: int
    project_id: int
    parent_id: int | None = Field(description="Null for a root Task.")
    section_id: int | None = Field(
        description="Null for No section, and for a Subtask, which sits in its root's Section.",
    )
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
    repeat_rule: str = Field(description="An RFC 5545 RRULE; empty when the Task doesn't repeat.")
    repeat_from: Task.RepeatFrom = Field(
        description="What the next Occurrence counts from: the due date, the completion date, or "
        "the calendar, which skips missed Occurrences.",
    )
    is_overdue: bool = Field(
        description="Whether the Task is open and its due date or time has passed in the user's "
        "time zone. A range is overdue only once its end has passed.",
    )
    tags: list[TagOut] = Field(description="In the user's Tag order.")
    created_at: datetime
    updated_at: datetime
    attachment_count: int = Field(
        default=0,
        description="How many Attachments the Task has. A Task just added has none.",
    )
    comment_count: int = Field(
        default=0,
        description="How many Comments the Task has. A Task just added has none.",
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
    reminders: list[ReminderOut] = Field(description="Earliest offset first.")


class TaskListQuery(Schema):
    """Which Tasks to list: one Project's, Person's, Tag's or view's, open or Closed."""

    project: int | None = None
    person: int | None = None
    tag: int | None = None
    view: View | None = Field(default=None, description="Today, Upcoming or All, picked by date.")
    closed: bool = Field(default=False, description="List Closed Tasks, a page at a time.")
    cursor: str | None = Field(default=None, description="From the previous page of Closed ones.")

    @model_validator(mode="after")
    def _at_most_one_source(self) -> Self:
        sources = (self.project, self.person, self.tag, self.view)
        if sum(source is not None for source in sources) > 1:
            message = "Give only one of project, person, tag or view."
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
    section_id: int | None = Field(
        default=None,
        description="Puts the Task in this Section of its Project. Ignored for a Subtask, which "
        "follows its root's.",
    )
    dates: TaskDatesIn | None = Field(
        default=None,
        description="Dates the Task from the start, such as today in Today.",
    )
    priority: Task.Priority | None = Field(
        default=None,
        description="1 (P1) is the most urgent; left out, the Task has no Priority.",
    )
    tags: list[TagName] = Field(
        default_factory=list,
        description="Tag names, in any case; Tags the user doesn't have yet are created.",
    )
    tag_ids: list[int] = Field(default_factory=list, description="Tags picked by id.")
    repeat_rule: RepeatRule | None = Field(
        default=None,
        description="Makes the Task repeat from its due date, as an RFC 5545 RRULE. Needs a due "
        "date; a Subtask can't repeat.",
    )
    repeat_from: Task.RepeatFrom | None = Field(
        default=None,
        description="What a repeating Task's next date counts from; the calendar when left out.",
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
        description="Replaces all of the Task's dates; null removes them and its Reminders.",
    )
    move_occurrence: bool | None = Field(
        default=None,
        description="With `dates`, moves only a repeating Task's current Occurrence, as a "
        "Calendar drag does: its later Occurrences stay where they were. Otherwise new dates "
        "restart the series at the new due date.",
    )
    reminders: list[ReminderOffset] | None = Field(
        default=None,
        description="Replaces the Task's Reminders: up to 10 different offsets. Needs a due date.",
    )
    project_id: int | None = Field(default=None, description="Moves the Task first into it.")
    repeat_rule: RepeatRule | None = Field(
        default=None,
        description="Makes a dated top-level Task repeat, as an RFC 5545 RRULE; an empty string "
        "stops it. Closing a repeating Task moves it on to its next Occurrence instead; setting "
        "the Status it had before, straight after, undoes that.",
    )
    repeat_from: Task.RepeatFrom | None = None
    tag_ids: list[int] | None = Field(default=None, description="Replaces all of its Tags.")


class TaskMoveIn(Schema):
    """Where a Task goes: under a parent, or to the top level of a Project, after a sibling."""

    project_id: int | None = Field(
        default=None,
        description="Defaults to the parent's Project, or the Task's own for a root.",
    )
    parent_id: int | None = Field(default=None, description="The top level when left out.")
    after_id: int | None = Field(
        default=None,
        description="The sibling it now follows; first when left out, last when it isn't there.",
    )
    section_id: int | None = Field(
        default=None,
        description="The Section of the destination Project a root joins; null for No section. "
        "When left out, a root staying in its Project keeps its Section and any other move "
        "clears it.",
    )


class AffectedTaskOut(Schema):
    """A Task whose Status a change touched, with its Status before, so the client can undo."""

    id: int
    prior_status: Task.Status
    prior_blocked_reason: str


class TaskChangeOut(Schema):
    """A changed Task and every Task whose Status the change touched."""

    task: TaskDetailOut
    affected: list[AffectedTaskOut]
