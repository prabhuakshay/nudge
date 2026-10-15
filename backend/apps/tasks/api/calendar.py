"""Calendar feed endpoints: show, turn on or reset, and turn off the feed, and the feed itself.

The feed is fetched by calendar apps without a session, so it opts out of auth and is found by
the secret in its address instead. It is rate-limited per IP so addresses can't be guessed.
"""

from __future__ import annotations

from http import HTTPStatus
from typing import TYPE_CHECKING

from django.conf import settings
from django.http import HttpResponse
from ninja import Router, Status
from ninja.throttling import AnonRateThrottle

from apps.core.auth import signed_in_user
from apps.core.schemas import ErrorOut
from apps.tasks import calendar_feed
from apps.tasks.schemas.calendar import CalendarFeedOut

if TYPE_CHECKING:
    from django.http import HttpRequest

router = Router()


class _FeedThrottle(AnonRateThrottle):
    """Counts feed fetches apart from sign-in attempts, which share the anonymous scope."""

    scope = "calendar_feed"


@router.get("/feed", response=CalendarFeedOut, summary="Get the Calendar feed address")
def get_feed(request: HttpRequest) -> CalendarFeedOut:
    """Return the signed-in user's feed address, or null while the feed is off."""
    return CalendarFeedOut(url=calendar_feed.feed_url(signed_in_user(request)))


@router.post("/feed", response=CalendarFeedOut, summary="Turn on or reset the Calendar feed")
def turn_on_feed(request: HttpRequest) -> CalendarFeedOut:
    """Give the user a new feed address; any old address stops working."""
    return CalendarFeedOut(url=calendar_feed.turn_on(signed_in_user(request)))


@router.delete(
    "/feed",
    response={HTTPStatus.NO_CONTENT: None},
    summary="Turn off the Calendar feed",
)
def turn_off_feed(request: HttpRequest) -> Status[None]:
    """Clear the user's feed address so it stops working."""
    calendar_feed.turn_off(signed_in_user(request))
    return Status(HTTPStatus.NO_CONTENT, None)


@router.get(
    "/{token}.ics",
    response={HTTPStatus.NOT_FOUND: ErrorOut},
    auth=None,
    throttle=[_FeedThrottle(settings.CALENDAR_FEED_RATE_LIMIT)],
    summary="Fetch a Calendar feed",
    openapi_extra={
        "responses": {
            HTTPStatus.OK: {
                "description": "The feed as an iCalendar file.",
                "content": {"text/calendar": {"schema": {"type": "string"}}},
            },
        },
    },
)
def feed(request: HttpRequest, token: str) -> HttpResponse | Status[ErrorOut]:
    """Return the feed's owner's open dated Tasks as an iCalendar file."""
    user = calendar_feed.feed_owner(token)
    if user is None:
        return Status(HTTPStatus.NOT_FOUND, ErrorOut(detail="Calendar feed not found."))
    return HttpResponse(calendar_feed.render(user), content_type="text/calendar; charset=utf-8")
