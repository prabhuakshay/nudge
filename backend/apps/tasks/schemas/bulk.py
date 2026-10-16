"""Request and response shapes for changing several Tasks at once."""

from __future__ import annotations

from typing import Annotated, Literal

from ninja import Field, Schema
from pydantic import model_validator

from apps.tasks.models import Task  # noqa: TC001 - Pydantic needs the type at runtime
from apps.tasks.schemas.tasks import (  # noqa: TC001 - Pydantic needs the types at runtime
    AffectedTaskOut,
    TaskDatesIn,
)

MAX_BULK = 500


class BulkMoveIn(Schema):
    """Move the Tasks first into a Project; a Subtask moved alone becomes a root there."""

    kind: Literal["move"]
    project_id: int


class BulkStatusIn(Schema):
    """Set the Tasks' Status, cascading through their trees as a single change does."""

    kind: Literal["status"]
    status: Task.Status


class TaskStatusIn(Schema):
    """The Status, and Blocked reason, to give one Task."""

    id: int
    status: Task.Status
    blocked_reason: str = ""


class BulkStatusesIn(Schema):
    """Give each Task its own Status, in the order listed, as Undo of a cascade does."""

    kind: Literal["statuses"]
    statuses: list[TaskStatusIn]


class TaskPlace(Schema):
    """Where a Task sits: its Project, its parent, the sibling before it and its Section."""

    id: int
    project_id: int
    parent_id: int | None = Field(description="None at the top level.")
    after_id: int | None = Field(description="None when it's first among its siblings.")
    section_id: int | None = Field(description="None in No section and for a Subtask.")


class BulkPlaceIn(Schema):
    """Put each Task in its own place, in the order listed, as Undo of a move does."""

    kind: Literal["place"]
    places: list[TaskPlace]


class BulkPriorityIn(Schema):
    """Set the Tasks' Priority."""

    kind: Literal["priority"]
    priority: Task.Priority


class BulkDatesIn(Schema):
    """Replace the Tasks' dates; their Reminders keep their offsets."""

    kind: Literal["dates"]
    dates: TaskDatesIn


class BulkTagIn(Schema):
    """Put a Tag on the Tasks, or take it off."""

    kind: Literal["add_tag", "remove_tag"]
    tag_id: int


class BulkDeleteIn(Schema):
    """Send the Tasks to Trash, each as its own unit with its Subtasks."""

    kind: Literal["delete"]


BulkAction = Annotated[
    BulkMoveIn
    | BulkStatusIn
    | BulkStatusesIn
    | BulkPlaceIn
    | BulkPriorityIn
    | BulkDatesIn
    | BulkTagIn
    | BulkDeleteIn,
    Field(discriminator="kind"),
]


class TaskBulkIn(Schema):
    """One action for several Tasks."""

    ids: list[int] = Field(min_length=1, max_length=MAX_BULK)
    action: BulkAction

    @model_validator(mode="after")
    def _entries_name_the_tasks(self) -> TaskBulkIn:
        """Refuse per-Task Statuses or places that aren't for exactly the Tasks given, in order."""
        action = self.action
        if isinstance(action, BulkStatusesIn | BulkPlaceIn):
            entries = action.statuses if isinstance(action, BulkStatusesIn) else action.places
            if self.ids != [entry.id for entry in entries]:
                message = "Each entry must be for a task given, in the same order."
                raise ValueError(message)
        return self


class TaskBulkOut(Schema):
    """What the action changed, for Undo."""

    affected: list[AffectedTaskOut] = Field(
        description="Every Task whose Status changed, with its Status before.",
    )
    moved_from: list[TaskPlace] = Field(
        description="For a move: where each moved Task was, in the order to put them back.",
    )
