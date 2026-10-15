"""Model managers for user accounts."""

from __future__ import annotations

from typing import TYPE_CHECKING, override

from django.contrib.auth.base_user import BaseUserManager

if TYPE_CHECKING:
    from apps.accounts.models import User


class UserManager(BaseUserManager["User"]):
    """Creates users identified by email address instead of a username."""

    use_in_migrations = True

    @override
    @classmethod
    def normalize_email(cls, email: str | None) -> str:
        """Lowercase the whole address so `Ada@Example.com` and `ada@example.com` are one user."""
        return (email or "").strip().lower()

    def create_user(self, email: str, password: str | None = None, **extra_fields: object) -> User:
        """Create and save a regular user."""
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        return self._create_user(email, password, **extra_fields)

    def create_superuser(
        self, email: str, password: str | None = None, **extra_fields: object
    ) -> User:
        """Create and save a user with full admin access."""
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        if not extra_fields["is_staff"] or not extra_fields["is_superuser"]:
            msg = "A superuser must have is_staff=True and is_superuser=True."
            raise ValueError(msg)
        return self._create_user(email, password, **extra_fields)

    def _create_user(self, email: str, password: str | None, **extra_fields: object) -> User:
        if not email:
            msg = "Users must have an email address."
            raise ValueError(msg)
        user = self.model(email=self.normalize_email(email), **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user
