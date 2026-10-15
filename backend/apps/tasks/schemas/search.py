"""Request and response shapes for searching Tasks."""

from __future__ import annotations

from typing import Annotated

from ninja import Field, Schema
from pydantic import StringConstraints

from apps.tasks.schemas.tasks import TaskOut
from apps.tasks.search import MatchIn  # noqa: TC001 - Pydantic needs the type at runtime

SearchText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=200)]


class TaskSearchQuery(Schema):
    """What to search for."""

    q: SearchText = Field(description="Words that must all appear, ignoring case.")


class TaskSearchOut(TaskOut):
    """A Task that matched a search, with where it matched and the text around the match."""

    match_in: MatchIn = Field(
        description="Where it matched: the title, else the Description, else a Comment.",
    )
    snippet: str = Field(
        description="The matching text as one plain line, cut to the part around the first match.",
    )
