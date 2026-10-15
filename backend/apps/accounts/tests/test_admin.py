"""Tests for the user admin pages."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from apps.accounts.forms import UserCreateForm, UserEditForm
from apps.accounts.models import User

if TYPE_CHECKING:
    from django.test import Client


@pytest.mark.django_db
def test_create_form_builds_user_from_email_and_name() -> None:
    form = UserCreateForm(
        data={
            "email": "Ada@Example.com",
            "full_name": "Ada Lovelace",
            "password1": "an-unusual-passphrase",
            "password2": "an-unusual-passphrase",
        }
    )

    assert form.is_valid(), form.errors
    user = form.save()
    assert user.email == "ada@example.com"
    assert user.full_name == "Ada Lovelace"


@pytest.mark.django_db
def test_admin_user_list_loads_for_superuser(client: Client) -> None:
    admin = User.objects.create_superuser("root@example.com", "pw", full_name="Root")
    client.force_login(admin)

    response = client.get("/admin/accounts/user/")

    assert response.status_code == 200
    assert b"root@example.com" in response.content


@pytest.mark.django_db
def test_edit_form_rejects_an_unknown_time_zone() -> None:
    ada = User.objects.create_user("ada@example.com", "pw", full_name="Ada Lovelace")
    form = UserEditForm(
        instance=ada,
        data={"email": ada.email, "full_name": ada.full_name, "time_zone": "Mars/Olympus_Mons"},
    )

    assert not form.is_valid()
    assert "time_zone" in form.errors
