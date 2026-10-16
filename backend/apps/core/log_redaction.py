"""Keeps Calendar feed tokens out of the logs.

A feed address carries its only secret in the path, so anyone who can read a log line with it
can read that user's Tasks. Both Django and Gunicorn log request paths, so their request loggers
run this filter.
"""

from __future__ import annotations

import logging
import re
from typing import override

_FEED_TOKEN = re.compile(r"(/calendar/)[^/?#\s\"]+(?=\.ics)")


def redact_feed_tokens(text: str) -> str:
    """Return the text with every Calendar feed token replaced by `[redacted]`."""
    return _FEED_TOKEN.sub(r"\1[redacted]", text)


class RedactFeedTokens(logging.Filter):
    """Logging filter that rewrites a record's message without any Calendar feed token."""

    @override
    def filter(self, record: logging.LogRecord) -> bool:
        """Render the message, redact it, and let the record through."""
        record.msg = redact_feed_tokens(record.getMessage())
        record.args = None
        return True
