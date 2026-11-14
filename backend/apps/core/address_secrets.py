"""Secrets for addresses that give access without signing in, like a Calendar feed's."""

from __future__ import annotations

import secrets

# 32 random bytes, so addresses can't be guessed.
_SECRET_BYTES = 32


def new_address_secret() -> str:
    """Return a new long, random, URL-safe secret to put in an address."""
    return secrets.token_urlsafe(_SECRET_BYTES)
