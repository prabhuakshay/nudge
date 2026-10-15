"""Sign-in, sign-out and session endpoints.

There is deliberately no sign-up endpoint: accounts are created by an administrator with
`manage.py createsuperuser` or the Django admin.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from django.conf import settings
from django.contrib import auth
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from ninja import Router, Status
from ninja.decorators import decorate_view
from ninja.security import django_auth
from ninja.throttling import AnonRateThrottle

from apps.accounts.managers import UserManager
from apps.accounts.models import User
from apps.accounts.schemas import ErrorOut, LoginIn, SessionOut, UserOut

if TYPE_CHECKING:
    from django.http import HttpRequest

router = Router()

_HTTP_NO_CONTENT = 204
_HTTP_UNAUTHORIZED = 401


@router.get("/session", response=SessionOut, auth=None, summary="Get the current session")
@decorate_view(ensure_csrf_cookie)
def session(request: HttpRequest) -> SessionOut:
    """Return the signed-in user, or no user, and set the CSRF cookie the frontend needs."""
    user = request.user
    return SessionOut(user=UserOut.from_orm(user) if isinstance(user, User) else None)


@router.post(
    "/login",
    response={200: UserOut, _HTTP_UNAUTHORIZED: ErrorOut},
    auth=None,
    throttle=[AnonRateThrottle(settings.LOGIN_RATE_LIMIT)],
    summary="Sign in",
)
@decorate_view(csrf_protect)
def login(request: HttpRequest, credentials: LoginIn) -> Status[UserOut] | Status[ErrorOut]:
    """Start a session for the user with these credentials."""
    user = auth.authenticate(
        request,
        email=UserManager.normalize_email(credentials.email),
        password=credentials.password,
    )
    if not isinstance(user, User):
        return Status(
            _HTTP_UNAUTHORIZED,
            ErrorOut(detail="That email and password don't match an account."),
        )
    auth.login(request, user)
    return Status(200, UserOut.from_orm(user))


@router.post(
    "/logout",
    response={_HTTP_NO_CONTENT: None},
    auth=django_auth,
    summary="Sign out",
)
def logout(request: HttpRequest) -> Status[None]:
    """End the current session."""
    auth.logout(request)
    return Status(_HTTP_NO_CONTENT, None)
