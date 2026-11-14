"""Keeps the secrets in Calendar feed and Share link addresses out of the logs.

Those addresses carry their only secret in the path, so anyone who can read a log line with one
can read the user's Tasks. Both Django and Gunicorn log request paths, so their request loggers
run this filter.
"""

from __future__ import annotations

import logging
import re
from typing import override

_FEED_TOKEN = re.compile(r"(/calendar/)[^/?#\s\"]+(?=\.ics)")
_SHARE_LINK_KEY = re.compile(r"(/share/)[^/?#\s\"]+")


def redact_address_secrets(text: str) -> str:
    """Return the text with each Calendar feed token and Share link key replaced by `[redacted]`."""
    text = _FEED_TOKEN.sub(r"\1[redacted]", text)
    return _SHARE_LINK_KEY.sub(r"\1[redacted]", text)


class RedactAddressSecrets(logging.Filter):
    """Logging filter that rewrites a record's message without any address secret."""

    @override
    def filter(self, record: logging.LogRecord) -> bool:
        """Render the message, redact it, and let the record through."""
        record.msg = redact_address_secrets(record.getMessage())
        record.args = None
        return True
