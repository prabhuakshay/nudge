"""Tests for the Project and Task models."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from apps.tasks import services
from apps.tasks.models import Attachment

if TYPE_CHECKING:
    from apps.accounts.models import User


@pytest.mark.django_db
def test_a_project_and_a_task_read_as_their_name_and_title(ada: User) -> None:
    inbox = services.inbox(ada)
    task = services.create_task(inbox, "Buy milk")

    assert (str(inbox), str(task)) == ("Inbox", "Buy milk")


@pytest.mark.django_db
def test_an_attachment_reads_as_its_original_name(ada: User) -> None:
    task = services.create_task(services.inbox(ada), "File the taxes")

    attachment = Attachment(task=task, name="receipt.pdf", size=1, content_type="application/pdf")

    assert str(attachment) == "receipt.pdf"
