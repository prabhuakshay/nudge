"""Tests for when the Task endpoints call a Task overdue, judged in the user's time zone."""

from __future__ import annotations

from datetime import UTC, date, datetime, time
from typing import TYPE_CHECKING

import pytest

from apps.accounts.services import set_time_zone
from apps.tasks import services
from apps.tasks.models import Task

if TYPE_CHECKING:
    from collections.abc import Callable

    from django.test import Client

    from apps.accounts.models import User


def _task(user: User, dates: services.TaskDates) -> Task:
    task = services.create_task(services.inbox(user), "Dated")
    services.update_task(user, task.pk, services.TaskPatch(dates=dates))
    return task


def _is_overdue(client: Client, task: Task) -> bool:
    overdue: bool = client.get(f"/api/v1/tasks/{task.pk}").json()["is_overdue"]
    return overdue


@pytest.fixture
def kolkata(ada: User) -> User:
    """Ada in UTC+05:30, so her day ends while it's still the same day in UTC."""
    return set_time_zone(ada, "Asia/Kolkata")


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("now", "overdue"),
    [
        (datetime(2026, 10, 15, 18, 29, tzinfo=UTC), False),
        (datetime(2026, 10, 15, 18, 30, tzinfo=UTC), True),
    ],
    ids=["23:59 on the day", "midnight after"],
)
def test_an_all_day_task_is_overdue_once_its_day_ends(
    client: Client,
    kolkata: User,
    freeze_time: Callable[[datetime], None],
    now: datetime,
    *,
    overdue: bool,
) -> None:
    task = _task(kolkata, services.TaskDates(due_date=date(2026, 10, 15)))

    freeze_time(now)

    assert _is_overdue(client, task) is overdue


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("now", "overdue"),
    [
        (datetime(2026, 10, 15, 3, 30, tzinfo=UTC), False),
        (datetime(2026, 10, 15, 3, 31, tzinfo=UTC), True),
    ],
    ids=["09:00, its time", "09:01"],
)
def test_a_timed_task_is_overdue_once_its_time_passes(
    client: Client,
    kolkata: User,
    freeze_time: Callable[[datetime], None],
    now: datetime,
    *,
    overdue: bool,
) -> None:
    task = _task(kolkata, services.TaskDates(due_date=date(2026, 10, 15), due_time=time(9)))

    freeze_time(now)

    assert _is_overdue(client, task) is overdue


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("now", "overdue"),
    [
        (datetime(2026, 10, 15, 12, tzinfo=UTC), False),
        (datetime(2026, 10, 16, 18, 30, tzinfo=UTC), True),
    ],
    ids=["after its start", "after its end"],
)
def test_a_range_is_overdue_only_after_its_end(
    client: Client,
    kolkata: User,
    freeze_time: Callable[[datetime], None],
    now: datetime,
    *,
    overdue: bool,
) -> None:
    task = _task(
        kolkata,
        services.TaskDates(start_date=date(2026, 10, 14), due_date=date(2026, 10, 16)),
    )

    freeze_time(now)

    assert _is_overdue(client, task) is overdue


@pytest.fixture
def london(ada: User) -> User:
    """Ada in Europe/London, whose clocks change on the last Sundays of March and October."""
    return set_time_zone(ada, "Europe/London")


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("day", "now"),
    [
        # Clocks jump from 01:00 to 02:00, so 01:30 never happens.
        (date(2026, 3, 29), datetime(2026, 3, 29, 0, 59, tzinfo=UTC)),
        # Clocks fall back from 02:00 to 01:00, so 01:30 happens twice.
        (date(2026, 10, 25), datetime(2026, 10, 25, 0, 29, tzinfo=UTC)),
    ],
    ids=["before the gap", "before the repeated hour"],
)
def test_a_task_due_at_a_dst_change_is_not_overdue_before_it(
    client: Client,
    london: User,
    freeze_time: Callable[[datetime], None],
    day: date,
    now: datetime,
) -> None:
    task = _task(london, services.TaskDates(due_date=day, due_time=time(1, 30)))

    freeze_time(now)

    assert _is_overdue(client, task) is False


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("day", "now"),
    [
        # 02:00 BST: the skipped 01:30 has passed.
        (date(2026, 3, 29), datetime(2026, 3, 29, 1, 0, tzinfo=UTC)),
        # 01:31 BST: the first 01:30 already counts.
        (date(2026, 10, 25), datetime(2026, 10, 25, 0, 31, tzinfo=UTC)),
    ],
    ids=["after the gap", "in the repeated hour"],
)
def test_a_task_due_at_a_dst_change_is_overdue_by_the_wall_clock(
    client: Client,
    london: User,
    freeze_time: Callable[[datetime], None],
    day: date,
    now: datetime,
) -> None:
    task = _task(london, services.TaskDates(due_date=day, due_time=time(1, 30)))

    freeze_time(now)

    assert _is_overdue(client, task) is True


@pytest.mark.django_db
def test_a_completed_task_is_never_overdue(
    client: Client,
    kolkata: User,
    freeze_time: Callable[[datetime], None],
) -> None:
    task = _task(kolkata, services.TaskDates(due_date=date(2026, 10, 1)))
    services.update_task(kolkata, task.pk, services.TaskPatch(status=Task.Status.COMPLETED))

    freeze_time(datetime(2026, 10, 15, tzinfo=UTC))

    assert _is_overdue(client, task) is False


@pytest.mark.django_db
def test_list_rows_say_whether_they_are_overdue(
    client: Client,
    kolkata: User,
    freeze_time: Callable[[datetime], None],
) -> None:
    late = _task(kolkata, services.TaskDates(due_date=date(2026, 10, 14)))
    _task(kolkata, services.TaskDates(due_date=date(2026, 10, 15)))
    services.create_task(services.inbox(kolkata), "Undated")
    freeze_time(datetime(2026, 10, 15, 12, tzinfo=UTC))

    response = client.get(f"/api/v1/tasks?project={services.inbox(kolkata).pk}")

    overdue = [item["id"] for item in response.json()["items"] if item["is_overdue"]]
    assert overdue == [late.pk]
