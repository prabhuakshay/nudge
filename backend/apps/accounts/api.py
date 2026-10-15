"""Sign-in, sign-out, session, profile and password endpoints.

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
from ninja.throttling import AnonRateThrottle, UserRateThrottle

from apps.accounts.managers import UserManager
from apps.accounts.models import User
from apps.accounts.schemas import (
    ErrorOut,
    LoginIn,
    PasswordChangeIn,
    ProfileIn,
    SessionOut,
    UserOut,
)
from apps.accounts.services import PasswordChangeError, change_password, update_profile

if TYPE_CHECKING:
    from django.http import HttpRequest

router = Router()

_HTTP_NO_CONTENT = 204
_HTTP_BAD_REQUEST = 400
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


@router.post(
    "/password",
    response={_HTTP_NO_CONTENT: None, _HTTP_BAD_REQUEST: ErrorOut},
    auth=django_auth,
    throttle=[UserRateThrottle(settings.LOGIN_RATE_LIMIT)],
    summary="Change password",
)
def password(request: HttpRequest, passwords: PasswordChangeIn) -> Status[None] | Status[ErrorOut]:
    """Change the signed-in user's password, keeping this session and ending all others."""
    user = request.user
    assert isinstance(user, User)  # noqa: S101 - django_auth only lets signed-in users through
    try:
        change_password(user, passwords.current_password, passwords.new_password)
    except PasswordChangeError as error:
        return Status(_HTTP_BAD_REQUEST, ErrorOut(detail=str(error)))
    auth.update_session_auth_hash(request, user)
    return Status(_HTTP_NO_CONTENT, None)


@router.patch("/profile", response=UserOut, auth=django_auth, summary="Update profile")
def profile(request: HttpRequest, changes: ProfileIn) -> UserOut:
    """Change the signed-in user's name and return the updated user."""
    user = request.user
    assert isinstance(user, User)  # noqa: S101 - django_auth only lets signed-in users through
    return UserOut.from_orm(update_profile(user, changes.full_name))
