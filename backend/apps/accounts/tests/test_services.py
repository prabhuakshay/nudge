"""Tests for account operations."""

from __future__ import annotations

import pytest

from apps.accounts.models import User
from apps.accounts.services import PasswordChangeError, change_password

PASSWORD = "an-unusual-passphrase"


@pytest.fixture
def ada() -> User:
    return User.objects.create_user("ada@example.com", PASSWORD, full_name="Ada Lovelace")


@pytest.mark.django_db
def test_change_password_saves_the_new_password(ada: User) -> None:
    change_password(ada, PASSWORD, "a-fresh-passphrase")

    ada.refresh_from_db()
    assert ada.check_password("a-fresh-passphrase")


@pytest.mark.django_db
def test_change_password_rejects_wrong_current_password(ada: User) -> None:
    with pytest.raises(PasswordChangeError, match="current password is incorrect"):
        change_password(ada, "wrong", "a-fresh-passphrase")


@pytest.mark.django_db
def test_change_password_rejects_a_password_like_the_email(ada: User) -> None:
    with pytest.raises(PasswordChangeError, match="too similar"):
        change_password(ada, PASSWORD, "ada@example.com")

    ada.refresh_from_db()
    assert ada.check_password(PASSWORD)
