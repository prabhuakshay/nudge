"""Repeat: a dated root Task that comes back on a schedule, one row moving through its Occurrences.

A rule is a plain RFC 5545 RRULE, read with python-dateutil. Its DTSTART is `repeat_anchor` at the
Task's due time, both floating clock times, so a series keeps its clock time across daylight
saving. Closing a repeating Task doesn't close it: the same row moves on to its next Occurrence
(Won't do skips one), its Subtasks start over, and dated Subtasks move by as many days. Only when
the rule has no next Occurrence does the Task close for real.

Closing works out the next Occurrence here; `apps.tasks.advance` moves the Task there. The
Calendar asks here for the Occurrences after the current one.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta

from dateutil.rrule import rrule, rrulestr

from apps.core.errors import DomainRuleError
from apps.tasks.advance import Advance, Revert, last_undo
from apps.tasks.dates import TaskDates
from apps.tasks.models import CLOSED_STATUSES, Task, TaskActivity
from apps.tasks.rows import local_now

_FREQUENCIES = frozenset({"DAILY", "WEEKLY", "MONTHLY", "YEARLY"})
_COUNT = re.compile(r"(;?COUNT=)(\d+)")
_UNREADABLE = "That isn't a repeat rule Nudge understands."
SUBTASK_REPEAT = "Only a top-level task can repeat."


class RepeatRuleError(DomainRuleError):
    """A Repeat that would break a Repeat rule. The message says which, in the user's words."""


@dataclass(frozen=True)
class Repeat:
    """A Task's rule and what its next Occurrence counts from."""

    rule: str
    repeat_from: str

    @classmethod
    def of(cls, task: Task) -> Repeat | None:
        """Return the Task's Repeat, or None when it doesn't repeat."""
        return cls(task.repeat_rule, task.repeat_from) if task.repeat_rule else None

    def as_activity(self) -> dict[str, str]:
        """Return the Repeat as Activity stores it."""
        return {"rule": self.rule, "repeat_from": self.repeat_from}


def _activity(repeat: Repeat | None) -> dict[str, str] | None:
    return None if repeat is None else repeat.as_activity()


def _read(rule: str, start: datetime) -> rrule:
    """Return the rule as dateutil reads it, starting at `start`.

    Raises:
        RepeatRuleError: The rule isn't a single RRULE dateutil can read.
    """
    try:
        parsed = rrulestr(rule, dtstart=start)
    except (ValueError, TypeError, IndexError) as error:
        raise RepeatRuleError(_UNREADABLE) from error
    if not isinstance(parsed, rrule):
        raise RepeatRuleError(_UNREADABLE)
    return parsed


def normalise(rule: str) -> str:
    """Return the rule without an `RRULE:` prefix, once it is known to be one Nudge can follow.

    Raises:
        RepeatRuleError: dateutil can't read it, it holds more than one line, or it repeats more
            often than daily.
    """
    text = rule.strip().upper().removeprefix("RRULE:")
    if "\n" in text:
        raise RepeatRuleError(_UNREADABLE)
    _read(text, datetime(2000, 1, 1))  # noqa: DTZ001 - rules are floating, so any naive start will do
    parts = dict(part.split("=", 1) for part in text.split(";") if "=" in part)
    if parts.get("FREQ") not in _FREQUENCIES:
        message = "A task repeats at most daily."
        raise RepeatRuleError(message)
    return text


def apply_edit(
    task: Task,
    rule: str | None,
    repeat_from: Task.RepeatFrom | None,
    dates_before: TaskDates,
    *,
    move_occurrence: bool = False,
) -> None:
    """Set or clear the Task's Repeat; the caller saves it. A rule left as None stays as it is.

    The series restarts at the due date whenever the rule or the dates change, unless the new
    dates only move the current Occurrence. A Task that has lost its due date stops repeating.

    Raises:
        RepeatRuleError: The rule is unreadable, or the Task is a Subtask or undated.
    """
    if repeat_from is not None:
        task.repeat_from = repeat_from
    if rule is not None:
        task.repeat_rule = normalise(rule) if rule else ""
        if task.repeat_rule and task.parent_id is not None:
            raise RepeatRuleError(SUBTASK_REPEAT)
        if task.repeat_rule and task.due_date is None:
            message = "A repeating task needs a due date."
            raise RepeatRuleError(message)
    if task.due_date is None:
        task.repeat_rule = ""
    if not task.repeat_rule:
        task.repeat_anchor = None
    elif rule is not None or (TaskDates.of(task) != dates_before and not move_occurrence):
        task.repeat_anchor = task.due_date


def start(task: Task, rule: str, repeat_from: Task.RepeatFrom | None) -> None:
    """Make a new, saved Task repeat on the rule from its due date, and save that.

    Raises:
        RepeatRuleError: The rule is unreadable, or the Task is a Subtask or undated.
    """
    apply_edit(task, rule, repeat_from, TaskDates.of(task))
    task.save(update_fields=["repeat_rule", "repeat_anchor", "repeat_from"])


def edit_event(task: Task, before: Repeat | None, *, asked: bool) -> TaskActivity | None:
    """Return the Activity event for a change of Repeat, or None if it didn't change.

    A Repeat the user didn't touch but lost along with the due date is logged as removed.
    """
    after = Repeat.of(task)
    if after == before:
        return None
    if after is None and not asked:
        return TaskActivity(
            task=task, kind=TaskActivity.Kind.REPEAT_REMOVED, data=_activity(before)
        )
    data = {"old": _activity(before), "new": _activity(after)}
    return TaskActivity(task=task, kind=TaskActivity.Kind.REPEAT_CHANGED, data=data)


def remove(task: Task) -> list[TaskActivity]:
    """Stop the Task repeating, as a Subtask must; the caller saves it.

    Returns:
        The `repeat_removed` event, or nothing when the Task didn't repeat.
    """
    before = Repeat.of(task)
    if before is None:
        return []
    task.repeat_rule, task.repeat_anchor = "", None
    return [
        TaskActivity(task=task, kind=TaskActivity.Kind.REPEAT_REMOVED, data=before.as_activity())
    ]


def plan(task: Task, status: Task.Status | None) -> Advance | Revert | None:
    """Return what setting the Status does to a repeating Task, or None when it simply sets it.

    Raises:
        RepeatRuleError: The Status would close an Occurrence that isn't due yet.
    """
    if not task.repeat_rule or status is None or task.status in CLOSED_STATUSES:
        return None
    if status not in CLOSED_STATUSES:
        undo = last_undo(task)
        return Revert(undo) if undo is not None and undo["status"] == status else None
    today = local_now(task.owner).date()
    assert task.due_date is not None  # noqa: S101 - only a dated Task repeats
    if task.due_date > today:
        message = "This repeating task isn't due yet."
        raise RepeatRuleError(message)
    found = _next(task, today)
    return None if found is None else Advance(status, *found)


def _next(task: Task, today: date) -> tuple[date, str] | None:
    """Return the Task's next Occurrence and its rule from then on, or None when it has none.

    From completion, the series restarts today, so a `COUNT` can't count from the anchor; it
    counts down in the rule instead.
    """
    assert task.due_date is not None  # noqa: S101 - only a dated Task repeats
    assert task.repeat_anchor is not None  # noqa: S101 - every repeating Task has one
    at = task.due_time or time.min
    current = datetime.combine(task.due_date, at)
    if task.repeat_from != Task.RepeatFrom.COMPLETION:
        series = _read(task.repeat_rule, datetime.combine(task.repeat_anchor, at))
        if task.repeat_from == Task.RepeatFrom.CALENDAR:
            current = max(current, datetime.combine(today, time.max))
        found = series.after(current)
        return None if found is None else (found.date(), task.repeat_rule)
    count = _COUNT.search(task.repeat_rule)
    if count is not None and int(count[2]) <= 1:
        return None
    rule = task.repeat_rule
    if count is not None:
        rule = _COUNT.sub(rf"\g<1>{int(count[2]) - 1}", rule)
    start = datetime.combine(today, at)
    found = _read(_COUNT.sub("", task.repeat_rule).strip(";"), start).after(start)
    return None if found is None else (found.date(), rule)


def later_occurrences(task: Task, start: date, end: date) -> list[date]:
    """Return the days of the Task's Occurrences after its current one, from `start` to `end`.

    Repeat from completion has no knowable future, so such a Task has none. On the calendar, an
    overdue Task's next Occurrence comes after today, so the days up to today are skipped too.
    """
    if not task.repeat_rule or task.repeat_from == Task.RepeatFrom.COMPLETION:
        return []
    assert task.due_date is not None  # noqa: S101 - only a dated Task repeats
    assert task.repeat_anchor is not None  # noqa: S101 - every repeating Task has one
    at = task.due_time or time.min
    current = task.due_date
    if task.repeat_from == Task.RepeatFrom.CALENDAR:
        current = max(current, local_now(task.owner).date())
    first = max(start, current + timedelta(days=1))
    series = _read(task.repeat_rule, datetime.combine(task.repeat_anchor, at))
    found = series.between(
        datetime.combine(first, time.min), datetime.combine(end, time.max), inc=True
    )
    return [occurrence.date() for occurrence in found]
