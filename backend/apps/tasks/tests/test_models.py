"""Tests for the Folder, Project and Task models."""

from __future__ import annotations

from datetime import date, time
from typing import TYPE_CHECKING

import pytest
from django.db import IntegrityError, transaction

from apps.tasks import creation, people, projects, services
from apps.tasks.models import Attachment, Comment, Task, TaskMention

if TYPE_CHECKING:
    from apps.accounts.models import User


@pytest.mark.django_db
def test_a_project_and_a_task_read_as_their_name_and_title(ada: User) -> None:
    inbox = services.inbox(ada)
    task = creation.create_task(inbox, "Buy milk")

    assert (str(inbox), str(task)) == ("Inbox", "Buy milk")


@pytest.mark.django_db
def test_a_folder_reads_as_its_name(ada: User) -> None:
    assert str(projects.create_folder(ada, "Personal")) == "Personal"


@pytest.mark.django_db
def test_a_person_and_a_mention_read_as_who_is_mentioned_where(ada: User) -> None:
    priya = people.create_person(ada, "Priya")
    task = creation.create_task(services.inbox(ada), f"Call [@Priya](person:{priya.pk})")

    mention = TaskMention.objects.get(task=task)

    assert (str(priya), str(mention)) == ("Priya", f"Priya in Call [@Priya](person:{priya.pk})")


@pytest.mark.django_db
def test_an_attachment_reads_as_its_original_name(ada: User) -> None:
    task = creation.create_task(services.inbox(ada), "File the taxes")

    attachment = Attachment(task=task, name="receipt.pdf", size=1, content_type="application/pdf")

    assert str(attachment) == "receipt.pdf"


@pytest.mark.django_db
def test_a_comment_reads_as_the_start_of_its_body(ada: User) -> None:
    task = creation.create_task(services.inbox(ada), "File the taxes")

    comment = Comment(task=task, body="x" * 60)

    assert str(comment) == "x" * 50


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
    task = creation.create_task(services.inbox(ada), "Trip")

    with pytest.raises(IntegrityError), transaction.atomic():
        Task.objects.filter(pk=task.pk).update(**dates)


@pytest.mark.django_db
def test_the_database_accepts_a_timed_range_across_midnight(ada: User) -> None:
    task = creation.create_task(services.inbox(ada), "Night train")

    Task.objects.filter(pk=task.pk).update(
        start_date=date(2026, 11, 3),
        start_time=time(22),
        due_date=date(2026, 11, 4),
        due_time=time(6, 30),
    )

    task.refresh_from_db()
    assert task.due_time == time(6, 30)
