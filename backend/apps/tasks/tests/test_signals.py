"""Tests for the Inbox every new user gets."""

from __future__ import annotations

import pytest
from django.db import IntegrityError

from apps.accounts.models import User
from apps.tasks.models import Project


@pytest.mark.django_db
def test_a_new_user_gets_an_inbox() -> None:
    user = User.objects.create_user("ada@example.com", "an-unusual-passphrase")

    assert list(user.projects.values_list("name", "is_inbox")) == [("Inbox", True)]


@pytest.mark.django_db
def test_saving_an_existing_user_adds_no_second_inbox(ada: User) -> None:
    ada.full_name = "Ada Lovelace"
    ada.save()

    assert ada.projects.count() == 1


@pytest.mark.django_db
def test_a_user_cannot_have_two_inboxes(ada: User) -> None:
    with pytest.raises(IntegrityError):
        Project.objects.create(owner=ada, name="Second inbox", is_inbox=True)
