"""The Task search endpoint."""

from __future__ import annotations

from http import HTTPStatus
from typing import TYPE_CHECKING

from ninja import Query, Router, Status

from apps.core.auth import signed_in_user
from apps.tasks.schemas.search import TaskSearchOut, TaskSearchQuery
from apps.tasks.schemas.tasks import TaskOut
from apps.tasks.search import search_tasks

if TYPE_CHECKING:
    from django.http import HttpRequest

router = Router()


@router.get("/search", response={HTTPStatus.OK: list[TaskSearchOut]}, summary="Search Tasks")
def search(request: HttpRequest, query: Query[TaskSearchQuery]) -> Status[list[TaskSearchOut]]:
    """Find Tasks whose title, Description or one Comment holds every word, best matches first.

    Archived Projects are searched too. At most 50 Tasks come back, with no further pages.
    """
    hits = [
        TaskSearchOut(
            **TaskOut.from_orm(hit.task).model_dump(),
            match_in=hit.match_in,
            snippet=hit.snippet,
        )
        for hit in search_tasks(signed_in_user(request), query.q)
    ]
    return Status(HTTPStatus.OK, hits)
