"""Business logic for the core app, kept separate from HTTP handling."""

from __future__ import annotations

from django.db import DatabaseError, connection


def database_is_available() -> bool:
    """Return whether the default database accepts connections."""
    try:
        connection.ensure_connection()
    except DatabaseError:
        return False
    return True
