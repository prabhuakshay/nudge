"""Tests for the data migration that gives existing users an Inbox."""

from __future__ import annotations

from importlib import import_module
from typing import TYPE_CHECKING

import pytest
from django.apps import apps

from apps.tasks.models import Project

if TYPE_CHECKING:
    from apps.accounts.models import User

backfill = import_module("apps.tasks.migrations.0002_backfill_inboxes")


@pytest.mark.django_db
def test_backfill_gives_every_user_without_an_inbox_one(ada: User, grace: User) -> None:
    grace.projects.all().delete()

    backfill.create_missing_inboxes(apps, None)

    assert Project.objects.filter(is_inbox=True, owner=grace).count() == 1
    assert Project.objects.filter(is_inbox=True, owner=ada).count() == 1
