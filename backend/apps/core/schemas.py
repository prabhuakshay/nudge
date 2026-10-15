"""Request and response shapes for the core API."""

from __future__ import annotations

from typing import Literal

from ninja import Schema


class ErrorOut(Schema):
    """A human-readable error message."""

    detail: str


class HealthOut(Schema):
    """Service health, as reported to load balancers and uptime monitors."""

    status: Literal["ok", "degraded"]
    database: Literal["ok", "unavailable"]
