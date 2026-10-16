"""The Calendar View's endpoint: the Tasks a range of days shows.

It lives under `/tasks`, since `/calendar` belongs to the Calendar feed.
"""

from __future__ import annotations

from http import HTTPStatus
from typing import TYPE_CHECKING

from ninja import Query, Router, Status

from apps.core.auth import signed_in_user
from apps.core.schemas import ErrorOut
from apps.tasks import calendar_view
from apps.tasks.schemas.calendar_view import CalendarOut, CalendarQuery

if TYPE_CHECKING:
    from django.http import HttpRequest

router = Router()


@router.get(
    "/calendar",
    response={HTTPStatus.OK: CalendarOut, HTTPStatus.UNPROCESSABLE_ENTITY: ErrorOut},
    summary="List the Tasks on a range of days",
)
def calendar(request: HttpRequest, query: Query[CalendarQuery]) -> Status[CalendarOut]:
    """Return the dated Tasks, open and Closed, whose dates overlap the range, both days included.

    Repeating Tasks also list the days they come back on after their current Occurrence.
    Trashed Tasks and archived Projects' Tasks are left out. A range that ends before it starts,
    or is over 42 days long, is refused.
    """
    shown = calendar_view.calendar(signed_in_user(request), query.start, query.end)
    return Status(HTTPStatus.OK, CalendarOut.from_orm(shown))
