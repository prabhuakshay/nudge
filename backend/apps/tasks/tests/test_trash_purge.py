"""Tests for the daily purge that deletes expired Trash units for good."""

from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta
from typing import TYPE_CHECKING

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.notifications.models import Notification
from apps.tasks import attachments, comments, mentions, people, purge, reminders, services, trash
from apps.tasks.dates import TaskDates
from apps.tasks.models import (
    Attachment,
    Comment,
    Reminder,
    Task,
    TaskActivity,
    TaskMention,
)

if TYPE_CHECKING:
    from collections.abc import Callable
    from pathlib import Path

    from pytest_django import Settings
    from pytest_django.fixtures import DjangoCaptureOnCommitCallbacks

    from apps.accounts.models import User

DELETED = datetime(2025, 3, 1, 9, 0, tzinfo=UTC)
RETENTION = timedelta(days=365)


@pytest.fixture(autouse=True)
def media_root(settings: Settings, tmp_path: Path) -> Path:
    settings.MEDIA_ROOT = tmp_path
    return tmp_path


def _stored_files(media_root: Path) -> list[Path]:
    return [path for path in media_root.rglob("*") if path.is_file()]


def _trashed(user: User, title: str, freeze_time: Callable[[datetime], None]) -> Task:
    freeze_time(DELETED)
    task = services.create_task(services.inbox(user), title)
    trash.trash_task(user, task.pk)
    return task


def _exists(task: Task) -> bool:
    return Task.objects.filter(pk=task.pk).exists()


@pytest.mark.django_db
def test_expired_units_are_deleted_and_unexpired_ones_kept(
    ada: User,
    freeze_time: Callable[[datetime], None],
) -> None:
    old = _trashed(ada, "Old", freeze_time)
    freeze_time(DELETED + timedelta(days=1))
    recent = services.create_task(services.inbox(ada), "Recent")
    trash.trash_task(ada, recent.pk)
    live = services.create_task(services.inbox(ada), "Live")
    freeze_time(DELETED + RETENTION)

    purged = purge.purge_expired_trash()

    assert purged == 1
    assert (_exists(old), _exists(recent), _exists(live)) == (False, True, True)


@pytest.mark.django_db
def test_the_retention_comes_from_settings(
    ada: User,
    settings: Settings,
    freeze_time: Callable[[datetime], None],
) -> None:
    settings.TRASH_RETENTION_DAYS = 30
    task = _trashed(ada, "Old", freeze_time)
    freeze_time(DELETED + timedelta(days=29))
    assert purge.purge_expired_trash() == 0
    freeze_time(DELETED + timedelta(days=30))

    assert purge.purge_expired_trash() == 1
    assert not _exists(task)


@pytest.mark.django_db
def test_a_purged_unit_takes_its_subtasks_and_everything_on_them(
    ada: User,
    freeze_time: Callable[[datetime], None],
) -> None:
    freeze_time(DELETED)
    alice = people.create_person(ada, "Alice")
    task = services.create_task(services.inbox(ada), "Move house")
    subtask = services.create_subtask(task, "Pack").task
    services.update_task(
        ada,
        subtask.pk,
        services.TaskEdit(
            title=f"Pack with {mentions.token(alice)}",
            dates=TaskDates(due_date=date(2025, 3, 2), due_time=time(9, 0)),
            reminders=[timedelta(0)],
        ),
    )
    comments.add_comment(subtask, "Boxes are in the garage")
    trash.trash_task(ada, task.pk)
    freeze_time(DELETED + RETENTION)

    purge.purge_expired_trash()

    assert list(Task.objects.filter(owner=ada)) == []
    assert not Comment.objects.exists()
    assert not TaskActivity.objects.exists()
    assert not TaskMention.objects.exists()
    assert not Reminder.objects.exists()
    assert people.people(ada).get() == alice


@pytest.mark.django_db
def test_a_fired_reminders_notification_outlives_the_purge(
    ada: User,
    freeze_time: Callable[[datetime], None],
) -> None:
    freeze_time(DELETED)
    task = services.create_task(services.inbox(ada), "Call the bank")
    edit = services.TaskEdit(
        dates=TaskDates(due_date=DELETED.date(), due_time=time(9, 30)),
        reminders=[timedelta(0)],
    )
    services.update_task(ada, task.pk, edit)
    freeze_time(DELETED + timedelta(minutes=30))
    reminders.send_due_reminders()
    trash.trash_task(ada, task.pk)
    freeze_time(DELETED + RETENTION + timedelta(days=1))

    purge.purge_expired_trash()

    notification = Notification.objects.get(user=ada)
    assert notification.reminder is None


@pytest.mark.django_db
def test_attachment_files_are_deleted_only_after_the_purge_commits(
    ada: User,
    media_root: Path,
    freeze_time: Callable[[datetime], None],
    django_capture_on_commit_callbacks: DjangoCaptureOnCommitCallbacks,
) -> None:
    freeze_time(DELETED)
    task = services.create_task(services.inbox(ada), "File the taxes")
    attachments.attach_file(task, SimpleUploadedFile("return.pdf", b"%PDF"))
    trash.trash_task(ada, task.pk)
    freeze_time(DELETED + RETENTION)

    with django_capture_on_commit_callbacks(execute=True) as callbacks:
        purge.purge_expired_trash()
        assert len(_stored_files(media_root)) == 1

    assert len(callbacks) == 1
    assert _stored_files(media_root) == []
    assert not Attachment.objects.exists()
