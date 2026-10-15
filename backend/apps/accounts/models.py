"""Database models for user accounts."""

from __future__ import annotations

from typing import ClassVar, override

from django.contrib.auth.base_user import AbstractBaseUser
from django.contrib.auth.models import PermissionsMixin
from django.db import models
from django.db.models.functions import Lower
from django.utils import timezone

from apps.accounts.managers import UserManager


class User(AbstractBaseUser, PermissionsMixin):
    """A person who owns tasks and lists, signing in with their email address.

    Names are stored as one `full_name` field because splitting into first and last name
    doesn't fit how many people's names work.
    """

    email = models.EmailField("email address", unique=True)
    full_name = models.CharField(max_length=150, blank=True)
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
