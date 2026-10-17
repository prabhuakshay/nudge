"""Tests for when Reminders fire, and the sweep that fires them."""

from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta
from typing import TYPE_CHECKING

import pytest

from apps.accounts.services import set_time_zone
from apps.tasks import creation, placement, projects, reminders, services
from apps.tasks.dates import TaskDates
from apps.tasks.models import Project, Reminder, Task

if TYPE_CHECKING:
    from collections.abc import Callable

    from apps.accounts.models import User

# 13:00 in London (GMT in November).
NOW = datetime(2026, 11, 6, 13, 0, tzinfo=UTC)
THIRTY_MINUTES_BEFORE = timedelta(minutes=-30)


@pytest.fixture
def london(ada: User) -> User:
    return set_time_zone(ada, "Europe/London")


def _dated_task(
    user: User,
    due_date: date = date(2026, 11, 6),
    due_time: time | None = time(14, 0),
) -> Task:
    task = creation.create_task(services.inbox(user), "Call the bank")
    dates = TaskDates(due_date=due_date, due_time=due_time)
    services.update_task(user, task.pk, services.TaskEdit(dates=dates))
    return task


def _remind(user: User, task: Task, *offsets: timedelta) -> None:
    services.update_task(user, task.pk, services.TaskEdit(reminders=list(offsets)))


def _fire_at(task: Task) -> list[datetime | None]:
    return list(Reminder.objects.filter(task=task).values_list("fire_at", flat=True))


@pytest.mark.django_db
def test_a_timed_reminder_fires_at_the_offset_from_the_due_time(
    london: User,
    freeze_time: Callable[[datetime], None],
) -> None:
    freeze_time(NOW)
    task = _dated_task(london)

    _remind(london, task, THIRTY_MINUTES_BEFORE)

    assert _fire_at(task) == [datetime(2026, 11, 6, 13, 30, tzinfo=UTC)]


@pytest.mark.django_db
def test_an_all_day_reminder_counts_from_the_start_of_the_day_in_the_users_zone(
    ada: User,
    freeze_time: Callable[[datetime], None],
) -> None:
    freeze_time(NOW)
    set_time_zone(ada, "Asia/Kolkata")
    task = _dated_task(ada, due_date=date(2026, 11, 8), due_time=None)

    _remind(ada, task, timedelta(hours=9), timedelta(days=-1, hours=9))

    assert _fire_at(task) == [
        datetime(2026, 11, 7, 3, 30, tzinfo=UTC),
        datetime(2026, 11, 8, 3, 30, tzinfo=UTC),
    ]


@pytest.mark.django_db
def test_a_reminder_keeps_its_clock_time_across_a_daylight_saving_change(
    london: User,
    freeze_time: Callable[[datetime], None],
) -> None:
    freeze_time(datetime(2026, 10, 10, tzinfo=UTC))
    task = _dated_task(london, due_date=date(2026, 10, 26), due_time=None)

    _remind(london, task, timedelta(days=-7, hours=9))

    # 09:00 on 19 October is still summer time (BST), an hour ahead of UTC.
    assert _fire_at(task) == [datetime(2026, 10, 19, 8, 0, tzinfo=UTC)]


@pytest.mark.django_db
def test_a_range_reminds_from_its_start(
    london: User,
    freeze_time: Callable[[datetime], None],
) -> None:
    freeze_time(NOW)
    task = creation.create_task(services.inbox(london), "Trip")
    dates = TaskDates(date(2026, 11, 9), time(18, 0), date(2026, 11, 7), time(8, 0))
    services.update_task(london, task.pk, services.TaskEdit(dates=dates))

    _remind(london, task, timedelta(hours=-1))

    assert _fire_at(task) == [datetime(2026, 11, 7, 7, 0, tzinfo=UTC)]


@pytest.mark.django_db
def test_a_reminder_whose_time_has_passed_wont_fire(
    london: User,
    freeze_time: Callable[[datetime], None],
) -> None:
    freeze_time(NOW)
    task = _dated_task(london)

    _remind(london, task, timedelta(hours=-2))

    assert _fire_at(task) == [None]


@pytest.mark.django_db
def test_moving_the_due_time_moves_the_reminder(
    london: User,
    freeze_time: Callable[[datetime], None],
) -> None:
    freeze_time(NOW)
    task = _dated_task(london)
    _remind(london, task, THIRTY_MINUTES_BEFORE)

    dates = TaskDates(due_date=date(2026, 11, 6), due_time=time(16, 0))
    services.update_task(london, task.pk, services.TaskEdit(dates=dates))

    assert _fire_at(task) == [datetime(2026, 11, 6, 15, 30, tzinfo=UTC)]


@pytest.mark.django_db
def test_changing_the_time_zone_keeps_the_clock_time(
    london: User,
    freeze_time: Callable[[datetime], None],
) -> None:
    freeze_time(NOW)
    task = _dated_task(london)
    _remind(london, task, THIRTY_MINUTES_BEFORE)

    set_time_zone(london, "America/New_York")

    assert _fire_at(task) == [datetime(2026, 11, 6, 18, 30, tzinfo=UTC)]


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("status", "fires"),
    [(Task.Status.COMPLETED, False), (Task.Status.WONT_DO, False), (Task.Status.BLOCKED, True)],
)
def test_only_open_and_blocked_tasks_have_reminders_to_fire(
    london: User,
    freeze_time: Callable[[datetime], None],
    status: Task.Status,
    *,
    fires: bool,
) -> None:
    freeze_time(NOW)
    task = _dated_task(london)
    _remind(london, task, THIRTY_MINUTES_BEFORE)

    services.update_task(london, task.pk, services.TaskEdit(status=status))

    assert (_fire_at(task) != [None]) is fires


@pytest.mark.django_db
def test_reopening_a_task_schedules_its_reminders_again(
    london: User,
    freeze_time: Callable[[datetime], None],
) -> None:
    freeze_time(NOW)
    task = _dated_task(london)
    _remind(london, task, THIRTY_MINUTES_BEFORE)
    services.update_task(london, task.pk, services.TaskEdit(status=Task.Status.COMPLETED))

    services.update_task(london, task.pk, services.TaskEdit(status=Task.Status.OPEN))

    assert _fire_at(task) == [datetime(2026, 11, 6, 13, 30, tzinfo=UTC)]


@pytest.mark.django_db
def test_closing_a_parent_stops_its_subtasks_reminders(
    london: User,
    freeze_time: Callable[[datetime], None],
) -> None:
    freeze_time(NOW)
    parent = creation.create_task(services.inbox(london), "Move house")
    subtask = creation.create_subtask(parent, "Book the van").task
    dates = TaskDates(due_date=date(2026, 11, 6), due_time=time(14, 0))
    services.update_task(london, subtask.pk, services.TaskEdit(dates=dates))
    _remind(london, subtask, THIRTY_MINUTES_BEFORE)

    services.update_task(london, parent.pk, services.TaskEdit(status=Task.Status.COMPLETED))

    assert _fire_at(subtask) == [None]


@pytest.mark.django_db
def test_archiving_a_project_stops_its_reminders_and_unarchiving_restores_them(
    london: User,
    freeze_time: Callable[[datetime], None],
) -> None:
    freeze_time(NOW)
    work = projects.create_project(london, "Work")
    task = creation.create_task(work, "Send the report")
    dates = TaskDates(due_date=date(2026, 11, 6), due_time=time(14, 0))
    services.update_task(london, task.pk, services.TaskEdit(dates=dates))
    _remind(london, task, THIRTY_MINUTES_BEFORE)

    projects.archive_project(london, work.pk)
    archived = _fire_at(task)
    projects.unarchive_project(london, work.pk)

    assert archived == [None]
    assert _fire_at(task) == [datetime(2026, 11, 6, 13, 30, tzinfo=UTC)]


def _drag(user: User, task: Task, project: Project) -> None:
    placement.move(user, task.pk, placement.Destination(project_id=project.pk))


def _edit(user: User, task: Task, project: Project) -> None:
    services.update_task(user, task.pk, services.TaskEdit(project_id=project.pk))


@pytest.mark.parametrize("move", [_drag, _edit])
@pytest.mark.django_db
def test_moving_a_task_to_another_project_reschedules_its_subtasks_reminders(
    london: User,
    freeze_time: Callable[[datetime], None],
    move: Callable[[User, Task, Project], None],
) -> None:
    freeze_time(NOW)
    parent = creation.create_task(services.inbox(london), "Plan the trip")
    subtask = creation.create_subtask(parent, "Book the train").task
    dates = TaskDates(due_date=date(2026, 11, 6), due_time=time(14, 0))
    services.update_task(london, subtask.pk, services.TaskEdit(dates=dates))
    _remind(london, subtask, THIRTY_MINUTES_BEFORE)
    # A stale fire time shows whether the move reached the Subtask, which a bulk update skips.
    Reminder.objects.filter(task=subtask).update(fire_at=None)

    parent.refresh_from_db()
    move(london, parent, projects.create_project(london, "Travel"))

    assert _fire_at(subtask) == [datetime(2026, 11, 6, 13, 30, tzinfo=UTC)]


@pytest.mark.django_db
def test_clearing_the_due_date_deletes_the_reminders(london: User) -> None:
    task = _dated_task(london)
    _remind(london, task, THIRTY_MINUTES_BEFORE)

    services.update_task(london, task.pk, services.TaskEdit(dates=TaskDates()))

    assert not Reminder.objects.filter(task=task).exists()


@pytest.mark.django_db
def test_an_undated_task_cannot_have_reminders(london: User) -> None:
    task = creation.create_task(services.inbox(london), "Someday")

    with pytest.raises(reminders.ReminderRuleError, match="due date"):
        _remind(london, task, THIRTY_MINUTES_BEFORE)


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("offsets", "message"),
    [
        ([timedelta(minutes=-n) for n in range(11)], "10 reminders"),
        ([THIRTY_MINUTES_BEFORE, THIRTY_MINUTES_BEFORE], "twice"),
        ([timedelta(days=-366)], "365 days"),
        ([timedelta(days=366)], "365 days"),
    ],
)
def test_reminders_must_follow_the_rules(
    london: User,
    offsets: list[timedelta],
    message: str,
) -> None:
    task = _dated_task(london)

    with pytest.raises(reminders.ReminderRuleError, match=message):
        _remind(london, task, *offsets)
