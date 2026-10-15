"""Tests for the Project and Task models."""

from __future__ import annotations

from datetime import date, time
from typing import TYPE_CHECKING

import pytest
from django.db import IntegrityError, transaction

from apps.tasks import services
from apps.tasks.models import Task

if TYPE_CHECKING:
    from apps.accounts.models import User


@pytest.mark.django_db
def test_a_project_and_a_task_read_as_their_name_and_title(ada: User) -> None:
    inbox = services.inbox(ada)
    task = services.create_task(inbox, "Buy milk")

    assert (str(inbox), str(task)) == ("Inbox", "Buy milk")


@pytest.mark.django_db
@pytest.mark.parametrize(
    "dates",
    [
        pytest.param({"start_date": date(2026, 11, 2)}, id="start without due"),
        pytest.param({"due_time": time(9)}, id="due time without due date"),
        pytest.param(
            {"due_date": date(2026, 11, 6), "start_time": time(9)},
            id="start time without start date",
        ),
        pytest.param(
            {"start_date": date(2026, 11, 7), "due_date": date(2026, 11, 6)},
            id="start after due",
        ),
        pytest.param(
            {
                "start_date": date(2026, 11, 6),
                "start_time": time(15),
                "due_date": date(2026, 11, 6),
                "due_time": time(14),
            },
            id="start time after due time",
        ),
        pytest.param(
            {"start_date": date(2026, 11, 2), "due_date": date(2026, 11, 6), "due_time": time(9)},
            id="all-day start, timed due",
        ),
        pytest.param(
            {
                "start_date": date(2026, 11, 2),
                "start_time": time(9),
                "due_date": date(2026, 11, 6),
            },
            id="timed start, all-day due",
        ),
    ],
)
def test_the_database_rejects_impossible_dates(ada: User, dates: dict[str, date | time]) -> None:
    task = services.create_task(services.inbox(ada), "Trip")

    with pytest.raises(IntegrityError), transaction.atomic():
        Task.objects.filter(pk=task.pk).update(**dates)


@pytest.mark.django_db
def test_the_database_accepts_a_timed_range_across_midnight(ada: User) -> None:
    task = services.create_task(services.inbox(ada), "Night train")

    Task.objects.filter(pk=task.pk).update(
        start_date=date(2026, 11, 3),
        start_time=time(22),
        due_date=date(2026, 11, 4),
        due_time=time(6, 30),
    )

    task.refresh_from_db()
    assert task.due_time == time(6, 30)
