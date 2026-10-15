"""App configuration for `apps.accounts`."""

from __future__ import annotations

from django.apps import AppConfig


class AccountsConfig(AppConfig):
    """Registers the accounts app with Django."""

    name = "apps.accounts"
    label = "accounts"
