"""Tests for the Project and Task models."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from apps.tasks import services

if TYPE_CHECKING:
    from apps.accounts.models import User


@pytest.mark.django_db
def test_a_project_and_a_task_read_as_their_name_and_title(ada: User) -> None:
    inbox = services.inbox(ada)
    task = services.create_task(inbox, "Buy milk")

    assert (str(inbox), str(task)) == ("Inbox", "Buy milk")
