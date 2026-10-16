"""Tests for the Project and Folder services that the API tests can't observe."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from apps.tasks import projects

if TYPE_CHECKING:
    from apps.accounts.models import User


@pytest.mark.django_db
def test_deleting_a_folder_locks_the_sidebar_before_reading_its_projects(ada: User) -> None:
    folder = projects.create_folder(ada, "Areas")
    projects.create_project(ada, "Home", folder=folder)

    with CaptureQueriesContext(connection) as queries:
        projects.delete_folder(ada, folder.pk)

    sql = [query["sql"] for query in queries]
    first_lock = next(index for index, query in enumerate(sql) if "FOR UPDATE" in query)
    first_read = next(
        index
        for index, query in enumerate(sql)
        if query.startswith('SELECT "tasks_project"') and '"folder_id" =' in query
    )
    assert first_lock < first_read
