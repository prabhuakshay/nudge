"""Admin forms for creating and editing users."""

from __future__ import annotations

from django.contrib.auth.forms import BaseUserCreationForm, UserChangeForm

from apps.accounts.models import User


class UserCreateForm(BaseUserCreationForm[User]):
    """Create a user from an email address, name and password."""

    class Meta:
        """Form options."""

        model = User
        fields = ("email", "full_name")


class UserEditForm(UserChangeForm[User]):
    """Edit an existing user's details."""

    class Meta:
        """Form options."""

        model = User
        fields = ("email", "full_name", "time_zone")
