"""Request and response shapes for the People endpoints."""

from __future__ import annotations

from typing import Annotated

from ninja import Field, Schema
from pydantic import StringConstraints

from apps.core.palette import PaletteColor  # noqa: TC001 - Pydantic needs the type at runtime

# These characters would break a Mention token, `[@Name](person:<id>)`, written around the name.
PersonName = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        min_length=1,
        max_length=64,
        pattern=r"^[^@\[\]()]+$",
    ),
]


class PersonOut(Schema):
    """A Person in the user's address book."""

    id: int
    name: str
    color: PaletteColor


class PersonIn(Schema):
    """A new Person."""

    name: PersonName = Field(description="Unique among the user's People, ignoring case.")
    color: PaletteColor | None = Field(default=None, description="Random when left out.")


class PersonPatchIn(Schema):
    """The fields of a Person to change; fields left out stay as they are."""

    name: PersonName | None = Field(default=None, description="Rewrites every Mention.")
    color: PaletteColor | None = None


class PersonMergeIn(Schema):
    """The Person to fold another into."""

    into_id: int
