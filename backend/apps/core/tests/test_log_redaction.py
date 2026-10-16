"""Tests for keeping Calendar feed tokens out of the logs."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

import pytest

from apps.core.log_redaction import RedactFeedTokens, redact_feed_tokens

if TYPE_CHECKING:
    from collections.abc import Iterator

    from django.test import Client

TOKEN = "s3cr3t-T0ken_value"


@pytest.fixture
def django_request_log(caplog: pytest.LogCaptureFixture) -> Iterator[pytest.LogCaptureFixture]:
    """Capture django.request, which doesn't propagate to pytest's root handler."""
    logger = logging.getLogger("django.request")
    logger.addHandler(caplog.handler)
    yield caplog
    logger.removeHandler(caplog.handler)


@pytest.mark.django_db
def test_django_logs_an_unknown_feed_without_its_token(
    client: Client, django_request_log: pytest.LogCaptureFixture
) -> None:
    client.get(f"/api/v1/calendar/{TOKEN}.ics")

    logged = django_request_log.text
    assert "/api/v1/calendar/[redacted].ics" in logged
    assert TOKEN not in logged


def test_gunicorn_access_lines_carry_no_feed_token(caplog: pytest.LogCaptureFixture) -> None:
    logger = logging.getLogger("test.gunicorn.access")
    logger.addFilter(RedactFeedTokens())
    raw_uri = f"/api/v1/calendar/{TOKEN}.ics?refresh=1"
    # Gunicorn formats access lines from a dict of "atoms" like this one.
    atoms = {
        "r": f"GET {raw_uri} HTTP/1.1",
        "s": "200",
        "U": f"/api/v1/calendar/{TOKEN}.ics",
        "q": "refresh=1",
        "{raw_uri}e": raw_uri,
    }

    with caplog.at_level(logging.INFO, logger=logger.name):
        logger.info('"%(r)s" %(s)s %(U)s %(q)s %({raw_uri}e)s', atoms)

    assert caplog.messages == [
        (
            '"GET /api/v1/calendar/[redacted].ics?refresh=1 HTTP/1.1" 200 '
            "/api/v1/calendar/[redacted].ics refresh=1 /api/v1/calendar/[redacted].ics?refresh=1"
        )
    ]


def test_other_calendar_paths_are_left_alone() -> None:
    assert redact_feed_tokens("GET /api/v1/calendar/feed HTTP/1.1") == (
        "GET /api/v1/calendar/feed HTTP/1.1"
    )
