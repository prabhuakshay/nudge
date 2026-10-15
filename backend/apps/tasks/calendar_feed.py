"""The Calendar feed: a private, read-only `.ics` address that shows open dated Tasks as events.

The address carries a random secret instead of a session, because calendar apps fetch it from
their own servers. The secret is stored as is so the user can copy the address again at any
time; resetting rotates it and turning the feed off clears it.
"""

from __future__ import annotations

import secrets
from datetime import date, datetime, timedelta
from typing import TYPE_CHECKING
from urllib.parse import urlsplit

from django.conf import settings
from icalendar import Calendar, Event, vDuration

from apps.accounts.models import User
from apps.accounts.services import local_zone
from apps.tasks.archive import active_tasks
from apps.tasks.mentions import MENTION
from apps.tasks.models import OPEN_STATUSES

if TYPE_CHECKING:
    from zoneinfo import ZoneInfo

    from apps.tasks.models import Task

# 32 random bytes, so feed addresses can't be guessed.
_TOKEN_BYTES = 32
# Calendar apps choose when to refresh; this is the hint they may honour.
_REFRESH = timedelta(hours=1)
# A timed Task without a start shows as a short event that ends at its due time.
_TIMED_LENGTH = timedelta(minutes=30)


def _address(token: str) -> str:
    return f"{settings.PUBLIC_URL}/api/v1/calendar/{token}.ics"


def feed_url(user: User) -> str | None:
    """Return the user's Calendar feed address, or None while the feed is off."""
    token = user.calendar_feed_token
    return None if token is None else _address(token)


def turn_on(user: User) -> str:
    """Give the user a fresh feed address, replacing any old one, and return it."""
    token = secrets.token_urlsafe(_TOKEN_BYTES)
    user.calendar_feed_token = token
    user.save(update_fields=["calendar_feed_token"])
    return _address(token)


def turn_off(user: User) -> None:
    """Clear the user's feed address so it stops working."""
    user.calendar_feed_token = None
    user.save(update_fields=["calendar_feed_token"])


def feed_owner(token: str) -> User | None:
    """Return the active user whose feed address carries this token, if any."""
    return User.objects.filter(calendar_feed_token=token, is_active=True).first()


def render(user: User) -> bytes:
    """Return the user's open dated Tasks as an iCalendar file, one event per Task.

    Only VEVENTs: most calendar apps ignore VTODOs. Each event shows the Task's current
    Occurrence without an RRULE, and no alarms, because Nudge sends the Reminders itself.
    """
    calendar = Calendar()
    calendar.add("prodid", "-//Nudge//Calendar feed//EN")
    calendar.add("version", "2.0")
    calendar.calendar_name = "Nudge"
    calendar.add("refresh-interval", _REFRESH, parameters={"VALUE": "DURATION"})
    calendar.add("x-published-ttl", vDuration(_REFRESH))
    zone = local_zone(user)
    tasks = (
        active_tasks(user)
        .filter(status__in=OPEN_STATUSES, due_date__isnull=False)
        .select_related("project")
        .order_by("due_date", "due_time", "id")
    )
    for task in tasks:
        calendar.add_component(_event(task, zone))
    # Timed values name the user's zone, so the file must describe it.
    calendar.add_missing_timezones()
    body: bytes = calendar.to_ical()
    return body


def _event(task: Task, zone: ZoneInfo) -> Event:
    start, end = _span(task, zone)
    event = Event()
    event.add("uid", f"task-{task.pk}@{urlsplit(settings.PUBLIC_URL).hostname}")
    event.add("dtstamp", task.updated_at)
    event.add("dtstart", start)
    event.add("dtend", end)
    event.add("summary", _plain(task.title))
    event.add("description", _description(task))
    return event


def _span(task: Task, zone: ZoneInfo) -> tuple[date | datetime, date | datetime]:
    """Return when the Task's event starts and ends; an all-day end is the day after."""
    due_date = task.due_date
    assert due_date is not None  # noqa: S101 - the feed only holds dated Tasks
    start_date = task.start_date or due_date
    if task.due_time is None:
        return start_date, due_date + timedelta(days=1)
    due = datetime.combine(due_date, task.due_time, zone)
    if task.start_time is None:
        return due - _TIMED_LENGTH, due
    return datetime.combine(start_date, task.start_time, zone), due


def _description(task: Task) -> str:
    """Return the Project's name, the Task's notes and a link that opens the Task in Nudge."""
    project = task.project
    path = "/inbox" if project.is_inbox else f"/projects/{project.pk}"
    link = f"{settings.PUBLIC_URL}{path}?task={task.pk}"
    parts = (project.name, _plain(task.description), link)
    return "\n\n".join(part for part in parts if part)


def _plain(text: str) -> str:
    """Return the text with each Mention as the Person's plain name."""
    return MENTION.sub(r"\1", text)
