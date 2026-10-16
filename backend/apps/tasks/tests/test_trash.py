"""Tests for the Trash services that the API tests can't observe."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from apps.tasks import creation, services, trash
from apps.tasks.models import Task

if TYPE_CHECKING:
    from apps.accounts.models import User


@pytest.mark.django_db
def test_a_restored_task_keeps_its_exact_key_even_when_a_sibling_shares_it(ada: User) -> None:
    inbox = services.inbox(ada)
    returning = creation.create_task(inbox, "Returning")
    tied = creation.create_task(inbox, "Tied")
    Task.objects.filter(pk=tied.pk).update(position=returning.position)
    trash.trash_task(ada, returning.pk)

    trash.restore_task(ada, returning.pk)

    returning.refresh_from_db()
    tied.refresh_from_db()
    assert returning.position == tied.position


@pytest.mark.django_db
def test_a_restored_task_that_keeps_its_place_locks_its_project(ada: User) -> None:
    inbox = services.inbox(ada)
    task = creation.create_task(inbox, "Returning")
    trash.trash_task(ada, task.pk)

    with CaptureQueriesContext(connection) as queries:
        trash.restore_task(ada, task.pk)

    assert any(
        query["sql"].startswith('SELECT "tasks_project"') and "FOR UPDATE" in query["sql"]
        for query in queries
    )
