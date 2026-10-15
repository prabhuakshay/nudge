"""Response shapes for the Attachment endpoints."""

from __future__ import annotations

from datetime import datetime  # noqa: TC003 - Pydantic needs the type at runtime

from ninja import Field, Schema


class AttachmentOut(Schema):
    """A file attached to a Task. Its bytes come from the download endpoint."""

    id: int
    name: str = Field(description="The file's name as it was uploaded.")
    size: int = Field(description="In bytes.")
    content_type: str = Field(description="Chosen by the server from the file's name.")
    created_at: datetime
