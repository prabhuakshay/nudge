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
    single_key_shortcuts: bool = Field(
        description="Whether shortcuts of one unmodified key, such as C, are on."
    )
    projects_collapsed: bool = Field(
        description="Whether the sidebar's Projects section is collapsed."
    )
    tags_collapsed: bool = Field(description="Whether the sidebar's Tags section is collapsed.")
    people_collapsed: bool = Field(description="Whether the sidebar's People section is collapsed.")


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


class ShortcutsIn(Schema):
    """Whether the user wants single-key shortcuts on."""

    single_key: bool


class SidebarSectionsIn(Schema):
    """Sidebar sections to collapse or expand; a section left out keeps its state."""

    projects_collapsed: bool | None = None
    tags_collapsed: bool | None = None
    people_collapsed: bool | None = None
