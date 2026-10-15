"""Account operations that the API and admin tools share."""

from __future__ import annotations

from typing import TYPE_CHECKING

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError

if TYPE_CHECKING:
    from apps.accounts.models import User


class PasswordChangeError(Exception):
    """Raised when a password change is refused; the message is safe to show the user."""


def change_password(user: User, current_password: str, new_password: str) -> None:
    """Replace the user's password after checking the current one and the password rules.

    Raises:
        PasswordChangeError: The current password is wrong or the new one breaks a rule.
    """
    if not user.check_password(current_password):
        message = "Your current password is incorrect."
        raise PasswordChangeError(message)
    try:
        validate_password(new_password, user)
    except ValidationError as error:
        raise PasswordChangeError(" ".join(error.messages)) from error
    user.set_password(new_password)
    user.save(update_fields=["password"])
