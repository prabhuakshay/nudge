"""Request and response shapes for the Comment endpoints."""

from __future__ import annotations

from datetime import datetime  # noqa: TC003 - Pydantic needs the type at runtime
from typing import Annotated

from ninja import Field, Schema
from pydantic import StringConstraints

CommentBody = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=10_000),
]


class CommentIn(Schema):
    """A Comment's markdown body, which may hold Mention tokens of the user's People."""

    body: CommentBody


class CommentOut(Schema):
    """A Comment on a Task. It was edited when `updated_at` differs from `created_at`."""

    id: int
    task_id: int
    body: str = Field(description="Markdown, as the user wrote it.")
    created_at: datetime
    updated_at: datetime
