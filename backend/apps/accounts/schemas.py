"""Request and response shapes for the accounts API."""

from __future__ import annotations

from ninja import Schema


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


class ErrorOut(Schema):
    """A human-readable error message."""

    detail: str
