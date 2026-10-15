"""Request and response shapes for the accounts API."""

from __future__ import annotations

from ninja import Field, Schema


class UserOut(Schema):
    """The signed-in user, as the frontend sees them."""

    id: int
    email: str
    full_name: str


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


class ErrorOut(Schema):
    """A human-readable error message."""

    detail: str
