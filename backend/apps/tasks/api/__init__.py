"""HTTP endpoints for the tasks app, one router module per resource."""

from __future__ import annotations

from typing import TYPE_CHECKING

from apps.accounts.models import User

if TYPE_CHECKING:
    from django.http import HttpRequest


def signed_in_user(request: HttpRequest) -> User:
    """Return the request's user, typed as a `User`."""
    user = request.user
    assert isinstance(user, User)  # noqa: S101 - the API's global auth only lets signed-in users in
    return user
