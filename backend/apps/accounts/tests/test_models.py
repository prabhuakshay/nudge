"""Tests for the custom user model and its manager."""

from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import IntegrityError

from apps.accounts.models import User


def test_project_uses_the_custom_user_model() -> None:
    assert get_user_model() is User


@pytest.mark.django_db
def test_create_user_signs_in_with_email_and_hashes_password() -> None:
    user = User.objects.create_user("ada@example.com", "correct-horse-battery")

    assert user.get_username() == "ada@example.com"
    assert user.password != "correct-horse-battery"
    assert user.check_password("correct-horse-battery")
    assert not user.is_staff
    assert not user.is_superuser


@pytest.mark.django_db
def test_email_is_normalized_to_lowercase() -> None:
    user = User.objects.create_user("  Ada@Example.COM ", "pw")

    assert user.email == "ada@example.com"


@pytest.mark.django_db
def test_email_is_unique_regardless_of_case() -> None:
    User.objects.create_user("ada@example.com", "pw")

    with pytest.raises(IntegrityError):
        User.objects.create(email="ADA@example.com")


def test_create_user_requires_an_email() -> None:
    with pytest.raises(ValueError, match="email address"):
        User.objects.create_user("", "pw")


@pytest.mark.django_db
def test_create_superuser_grants_admin_access() -> None:
    admin = User.objects.create_superuser("root@example.com", "pw", full_name="Root")

    assert admin.is_staff
    assert admin.is_superuser


def test_create_superuser_rejects_non_staff() -> None:
    with pytest.raises(ValueError, match="is_staff=True"):
        User.objects.create_superuser("root@example.com", "pw", is_staff=False)


def test_clean_normalizes_email() -> None:
    user = User(email="Grace@Example.com")

    user.clean()

    assert user.email == "grace@example.com"


@pytest.mark.parametrize(
    ("full_name", "expected_full", "expected_short"),
    [
        ("Ada Lovelace", "Ada Lovelace", "Ada"),
        ("Plato", "Plato", "Plato"),
        ("", "ada@example.com", "ada@example.com"),
    ],
)
def test_names_fall_back_to_email(full_name: str, expected_full: str, expected_short: str) -> None:
    user = User(email="ada@example.com", full_name=full_name)

    assert user.get_full_name() == expected_full
    assert user.get_short_name() == expected_short
    assert str(user) == "ada@example.com"


def test_time_zone_is_unset_for_a_new_user() -> None:
    assert User(email="ada@example.com").time_zone == ""


def test_full_clean_accepts_an_iana_time_zone() -> None:
    user = User(email="ada@example.com", password="x", time_zone="Europe/London")

    user.full_clean(validate_unique=False, validate_constraints=False)


def test_full_clean_rejects_an_unknown_time_zone() -> None:
    user = User(email="ada@example.com", password="x", time_zone="Mars/Olympus_Mons")

    with pytest.raises(ValidationError, match="time zone"):
        user.full_clean(validate_unique=False, validate_constraints=False)
