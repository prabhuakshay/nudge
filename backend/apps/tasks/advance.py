"""Moving a repeating Task on to its next Occurrence, and undoing that.

An advance keeps the same row: its dates move to the next Occurrence, it is open again, its
Subtasks start over and dated Subtasks move by as many days. It is undone by setting the Status the
Task had before, while the advance is still the latest change to its dates or Status. What Undo
needs lives in the advance's Activity event, so the server keeps no separate undo store.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from typing import TYPE_CHECKING, NotRequired, TypedDict

from apps.tasks.dates import TaskDates
from apps.tasks.models import Task, TaskActivity
from apps.tasks.tree import AffectedTask, below, set_status

if TYPE_CHECKING:
    from django.db.models import QuerySet

# The Activity kinds that change where a Task stands, so a later one makes an advance final.
_LATER_CHANGES = (
    TaskActivity.Kind.REPEAT_ADVANCED,
    TaskActivity.Kind.DATES_CHANGED,
    TaskActivity.Kind.STATUS_CHANGED,
    TaskActivity.Kind.REPEAT_CHANGED,
    TaskActivity.Kind.REPEAT_REMOVED,
)


class _SubtaskBefore(TypedDict):
    """A Subtask as an advance found it."""

    id: int
    status: str
    blocked_reason: str
    dated: bool


class _Undo(TypedDict):
    """What undoing an advance puts back, kept in the advance's Activity event."""

    status: str
    blocked_reason: str
    dates: dict[str, str | None]
    rule: str
    # Missing from an advance logged before moved Occurrences were remembered.
    occurrence_date: NotRequired[str | None]
    subtasks: list[_SubtaskBefore]


@dataclass(frozen=True)
class Advance:
    """Moving a repeating Task on to `due`, its next Occurrence, instead of closing it."""

    status: Task.Status
    due: date
    rule: str

    def run(self, task: Task) -> list[AffectedTask]:
        """Move the Task and its Subtasks on, and log how to undo it. Call it in a transaction."""
        prior = AffectedTask(task.pk, Task.Status(task.status), task.blocked_reason)
        assert task.due_date is not None  # noqa: S101 - only a dated Task repeats
        occurrence, dates_before, rule_before = task.due_date, TaskDates.of(task), task.repeat_rule
        series_date = task.occurrence_date
        days = (self.due - occurrence).days
        _shift(task, days)
        task.status, task.blocked_reason, task.repeat_rule = Task.Status.OPEN, "", self.rule
        task.occurrence_date = None
        task.save(
            update_fields=[
                *_DATE_FIELDS,
                "status",
                "blocked_reason",
                "repeat_rule",
                "occurrence_date",
            ],
        )
        # A snooze belongs to the Occurrence that fired it, which is over now.
        task.reminders.update(snoozed_until=None)
        subtasks = [_start_over(subtask, task, days) for subtask in _subtasks(task)]
        undo: _Undo = {
            "status": prior.prior_status,
            "blocked_reason": prior.prior_blocked_reason,
            "dates": dates_before.as_activity() or {},
            "rule": rule_before,
            "occurrence_date": None if series_date is None else series_date.isoformat(),
            "subtasks": subtasks,
        }
        data = {
            "action": "skipped" if self.status == Task.Status.WONT_DO else "completed",
            "occurrence": occurrence.isoformat(),
            "next": self.due.isoformat(),
            "undo": undo,
        }
        TaskActivity.objects.create(task=task, kind=TaskActivity.Kind.REPEAT_ADVANCED, data=data)
        return [prior]


@dataclass(frozen=True)
class Revert:
    """Undoing the Task's latest advance: back to that Occurrence, as it was before."""

    undo: _Undo

    def run(self, task: Task) -> list[AffectedTask]:
        """Put the Task and its Subtasks back as the advance found them, in a transaction."""
        dates_before = TaskDates.of(task)
        restored = TaskDates.from_activity(self.undo["dates"])
        assert task.due_date is not None  # noqa: S101 - only a dated Task repeats
        assert restored.due_date is not None  # noqa: S101 - an advance starts from a due date
        days = (restored.due_date - task.due_date).days
        task.due_date, task.due_time = restored.due_date, restored.due_time
        task.start_date, task.start_time = restored.start_date, restored.start_time
        task.repeat_rule = self.undo["rule"]
        series_date = self.undo.get("occurrence_date")
        task.occurrence_date = None if series_date is None else date.fromisoformat(series_date)
        task.save(update_fields=[*_DATE_FIELDS, "repeat_rule", "occurrence_date"])
        data = {"old": dates_before.as_activity(), "new": restored.as_activity()}
        TaskActivity.objects.create(task=task, kind=TaskActivity.Kind.DATES_CHANGED, data=data)
        if self.undo["status"] != task.status:
            set_status(task, Task.Status(self.undo["status"]), via={})
            task.blocked_reason = self.undo["blocked_reason"]
            task.save(update_fields=["blocked_reason"])
        previous = {item["id"]: item for item in self.undo["subtasks"]}
        for subtask in _subtasks(task).filter(pk__in=previous):
            _restore(subtask, task, previous[subtask.pk], days)
        return []


def last_undo(task: Task) -> _Undo | None:
    """Return how to undo the Task's latest advance, unless something has changed it since."""
    latest = task.activity.filter(kind__in=_LATER_CHANGES).order_by("-at", "-id").first()
    if latest is None or latest.kind != TaskActivity.Kind.REPEAT_ADVANCED:
        return None
    undo: _Undo = latest.data["undo"]
    return undo


_DATE_FIELDS = ("due_date", "start_date", "updated_at")


def _shift(task: Task, days: int) -> None:
    """Move the Task's dates by whole days, keeping their clock times."""
    step = timedelta(days=days)
    if task.due_date is not None:
        task.due_date += step
    if task.start_date is not None:
        task.start_date += step


def _subtasks(task: Task) -> QuerySet[Task]:
    return below([task]).select_for_update(of=("self",))


def _start_over(subtask: Task, task: Task, days: int) -> _SubtaskBefore:
    """Reopen a Subtask for the next Occurrence and move its dates; return what it was."""
    before: _SubtaskBefore = {
        "id": subtask.pk,
        "status": subtask.status,
        "blocked_reason": subtask.blocked_reason,
        "dated": subtask.due_date is not None,
    }
    _move(subtask, days)
    if subtask.status != Task.Status.OPEN:
        set_status(subtask, Task.Status.OPEN, via={"via_parent": task.title})
    return before


def _restore(subtask: Task, task: Task, before: _SubtaskBefore, days: int) -> None:
    """Put a Subtask back as an advance found it."""
    if before["dated"]:
        _move(subtask, days)
    if subtask.status != before["status"]:
        set_status(subtask, Task.Status(before["status"]), via={"via_parent": task.title})
        subtask.blocked_reason = before["blocked_reason"]
        subtask.save(update_fields=["blocked_reason"])


def _move(subtask: Task, days: int) -> None:
    """Move a dated Subtask's dates by whole days, logging it."""
    if subtask.due_date is None:
        return
    before = TaskDates.of(subtask)
    _shift(subtask, days)
    subtask.save(update_fields=list(_DATE_FIELDS))
    data = {"old": before.as_activity(), "new": TaskDates.of(subtask).as_activity()}
    TaskActivity.objects.create(task=subtask, kind=TaskActivity.Kind.DATES_CHANGED, data=data)
