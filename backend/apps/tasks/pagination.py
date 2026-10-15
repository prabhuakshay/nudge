"""Newest-first keyset pagination for the tasks app's long lists.

A cursor holds the timestamp and id of the last row on a page, so the next page starts right after
it even when rows are added at the top in between, which offset pagination would get wrong.
"""

from __future__ import annotations

import base64
import binascii
from dataclasses import dataclass
from datetime import datetime
from typing import TYPE_CHECKING

from django.db import models

from apps.core.errors import DomainRuleError

if TYPE_CHECKING:
    from django.db.models import QuerySet

PAGE_SIZE = 50


class InvalidCursorError(DomainRuleError):
    """A pagination cursor that this server didn't hand out."""


@dataclass(frozen=True)
class Page[M: models.Model]:
    """One page of rows and the cursor for the next, if there is one."""

    items: list[M]
    next_cursor: str | None


def newest_first[M: models.Model](rows: QuerySet[M], field: str, cursor: str | None) -> Page[M]:
    """Return a page of rows ordered by the datetime `field`, newest first, ties by id.

    Raises:
        InvalidCursorError: The cursor wasn't one this function returned.
    """
    rows = rows.order_by(f"-{field}", "-id")
    if cursor is not None:
        at, pk = _decode(cursor)
        rows = rows.filter(**{f"{field}__lte": at}).exclude(**{field: at, "pk__gte": pk})
    page = list(rows[: PAGE_SIZE + 1])
    if len(page) <= PAGE_SIZE:
        return Page(items=page, next_cursor=None)
    last = page[PAGE_SIZE - 1]
    at = getattr(last, field)
    assert isinstance(at, datetime)  # noqa: S101 - callers paginate on a non-null datetime field
    return Page(items=page[:PAGE_SIZE], next_cursor=_encode(at, last.pk))


def _encode(at: datetime, pk: int) -> str:
    return base64.urlsafe_b64encode(f"{at.isoformat()}|{pk}".encode()).decode()


def _decode(cursor: str) -> tuple[datetime, int]:
    try:
        at, pk = base64.urlsafe_b64decode(cursor).decode().split("|")
        return datetime.fromisoformat(at), int(pk)
    except (binascii.Error, UnicodeDecodeError, ValueError) as error:
        message = "The cursor is not valid."
        raise InvalidCursorError(message) from error
