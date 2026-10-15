"""Request and response shapes for the accounts API."""

from __future__ import annotations

from ninja import Field, Schema
from pydantic import field_validator

from apps.accounts.models import is_time_zone


class UserOut(Schema):
    """The signed-in user, as the frontend sees them."""

    id: int
    email: str
    full_name: str
    time_zone: str = Field(description="IANA time zone name, or empty when not set yet.")


class SessionOut(Schema):
    """Who is signed in on this browser, if anyone."""

    user: UserOut | None


class LoginIn(Schema):
    """Credentials submitted from the sign-in form."""

    email: str
    password: str


class PasswordChangeIn(Schema):
    """The current password, to confirm it's really the user, and the one replacing it."""

    current_password: str
    new_password: str


class ProfileIn(Schema):
    """Profile fields the user can change themselves."""

    full_name: str = Field(max_length=150)


class TimeZoneIn(Schema):
    """The user's new time zone."""

    time_zone: str = Field(description="IANA time zone name, such as Europe/London.")

    @field_validator("time_zone")
    @classmethod
    def _must_be_iana_name(cls, value: str) -> str:
        if not is_time_zone(value):
            message = "Not a known IANA time zone name."
            raise ValueError(message)
        return value


class ErrorOut(Schema):
    """A human-readable error message."""

    detail: str
