"""Database models for user accounts."""

from __future__ import annotations

from functools import cache
from typing import ClassVar, override
from zoneinfo import available_timezones

from django.contrib.auth.base_user import AbstractBaseUser
from django.contrib.auth.models import PermissionsMixin
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models.functions import Lower
from django.utils import timezone

from apps.accounts.managers import UserManager


@cache
def _time_zone_names() -> frozenset[str]:
    return frozenset(available_timezones())


def is_time_zone(name: str) -> bool:
    """Return whether `name` is an IANA time zone name, such as `Europe/London`."""
    return name in _time_zone_names()


def validate_time_zone(name: str) -> None:
    """Reject anything that isn't an IANA time zone name.

    Raises:
        ValidationError: `name` is not a known time zone.
    """
    if not is_time_zone(name):
        message = f"{name!r} is not a known time zone."
        raise ValidationError(message)


class User(AbstractBaseUser, PermissionsMixin):
    """A person who owns tasks and lists, signing in with their email address.

    Names are stored as one `full_name` field because splitting into first and last name
    doesn't fit how many people's names work.
    """

    email = models.EmailField("email address", unique=True)
    full_name = models.CharField(max_length=150, blank=True)
    time_zone = models.CharField(
        max_length=64,
        blank=True,
        validators=[validate_time_zone],
        help_text=(
            "IANA name, such as Europe/London. Every clock time on the user's tasks is in this "
            "zone. Empty until the browser sets it on the first sign-in."
        ),
    )
    is_staff = models.BooleanField(
        default=False,
        help_text="Whether the user can sign in to the admin site.",
    )
    is_active = models.BooleanField(
        default=True,
        help_text="Unset this instead of deleting the account.",
    )
    date_joined = models.DateTimeField(default=timezone.now)

    objects: ClassVar[UserManager] = UserManager()

    EMAIL_FIELD = "email"
    USERNAME_FIELD = "email"
    REQUIRED_FIELDS: ClassVar[list[str]] = ["full_name"]

    class Meta:
        """Model options."""

        verbose_name = "user"
        verbose_name_plural = "users"
        constraints: ClassVar = [
            models.UniqueConstraint(Lower("email"), name="accounts_user_email_ci_unique"),
        ]

    @override
    def __str__(self) -> str:
        """Return the email address, which identifies the user everywhere."""
        return self.email

    @override
    def clean(self) -> None:
        """Normalize the email before validation, as the manager does on create."""
        super().clean()
        self.email = UserManager.normalize_email(self.email)

    def get_full_name(self) -> str:
        """Return the user's name, falling back to their email address."""
        return self.full_name or self.email

    def get_short_name(self) -> str:
        """Return the first word of the user's name, falling back to their email address."""
        return self.full_name.split(" ", 1)[0] if self.full_name else self.email
