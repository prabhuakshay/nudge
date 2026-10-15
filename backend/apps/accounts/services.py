"""Account operations that the API and admin tools share."""

from __future__ import annotations

from typing import TYPE_CHECKING
from zoneinfo import ZoneInfo

from django.conf import settings
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


def update_profile(user: User, full_name: str) -> User:
    """Save the user's display name, ignoring surrounding whitespace."""
    user.full_name = full_name.strip()
    user.save(update_fields=["full_name"])
    return user


def set_time_zone(user: User, time_zone: str) -> User:
    """Save the user's IANA time zone.

    Clock times on tasks are floating in this zone, so they keep their wall-clock value: a task
    due at 09:00 is still due at 09:00 in the new zone. Their Reminders move with them; the tasks
    app reschedules them when the zone is saved.
    """
    user.time_zone = time_zone
    user.save(update_fields=["time_zone"])
    return user


def local_zone(user: User) -> ZoneInfo:
    """Return the zone the user's clock times are in: theirs, or the server's until it's set."""
    return ZoneInfo(user.time_zone or settings.TIME_ZONE)
