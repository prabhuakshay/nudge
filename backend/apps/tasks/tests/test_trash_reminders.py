"""Tests that a Task in Trash never reminds, before or after it is restored."""

from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta
from typing import TYPE_CHECKING

import pytest

from apps.accounts.services import set_time_zone
from apps.tasks import services, trash
from apps.tasks.dates import TaskDates
from apps.tasks.models import Reminder

if TYPE_CHECKING:
    from collections.abc import Callable

    from apps.accounts.models import User
    from apps.tasks.models import Task

NOW = datetime(2026, 11, 6, 13, 0, tzinfo=UTC)


@pytest.fixture
def task(ada: User, freeze_time: Callable[[datetime], None]) -> Task:
    freeze_time(NOW)
    set_time_zone(ada, "UTC")
    dates = TaskDates(due_date=date(2026, 11, 6), due_time=time(14, 0))
    task = services.create_task(services.inbox(ada), "Call the bank", dates)
    services.update_task(ada, task.pk, services.TaskEdit(reminders=[timedelta(0)]))
    return task


def _fire_at(task: Task) -> datetime | None:
    return Reminder.objects.get(task=task).fire_at


@pytest.mark.django_db
def test_a_trashed_tasks_reminders_stop(ada: User, task: Task) -> None:
    trash.trash_task(ada, task.pk)

    assert _fire_at(task) is None


@pytest.mark.django_db
def test_a_trashed_subtasks_reminders_stop_with_its_parent(ada: User, task: Task) -> None:
    parent = services.create_task(services.inbox(ada), "Sort out money")
    task.parent = parent
    task.save(update_fields=["parent"])

    trash.trash_task(ada, parent.pk)

    assert _fire_at(task) is None


@pytest.mark.django_db
def test_restoring_before_the_reminder_is_due_schedules_it_again(ada: User, task: Task) -> None:
    trash.trash_task(ada, task.pk)

    trash.restore_task(ada, task.pk)

    assert _fire_at(task) == datetime(2026, 11, 6, 14, 0, tzinfo=UTC)


@pytest.mark.django_db
def test_a_reminder_that_came_due_in_trash_never_fires(
    ada: User,
    task: Task,
    freeze_time: Callable[[datetime], None],
) -> None:
    trash.trash_task(ada, task.pk)
    freeze_time(NOW + timedelta(hours=2))

    trash.restore_task(ada, task.pk)

    assert _fire_at(task) is None


@pytest.mark.django_db
def test_restoring_a_parent_schedules_its_subtasks_reminders_again(ada: User, task: Task) -> None:
    parent = services.create_task(services.inbox(ada), "Sort out money")
    task.parent = parent
    task.save(update_fields=["parent"])
    trash.trash_task(ada, parent.pk)

    trash.restore_task(ada, parent.pk)

    assert _fire_at(task) == datetime(2026, 11, 6, 14, 0, tzinfo=UTC)
