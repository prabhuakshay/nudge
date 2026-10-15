"""HTTP endpoints for the core app."""

from __future__ import annotations

from http import HTTPStatus
from typing import TYPE_CHECKING

from ninja import Router, Status

from apps.core import services
from apps.core.schemas import HealthOut

if TYPE_CHECKING:
    from django.http import HttpRequest

router = Router()


@router.get(
    "/health",
    response={HTTPStatus.OK: HealthOut, HTTPStatus.SERVICE_UNAVAILABLE: HealthOut},
    auth=None,
    summary="Check service health",
)
def health(request: HttpRequest) -> Status[HealthOut]:
    """Report whether the API and its database are working."""
    if services.database_is_available():
        return Status(HTTPStatus.OK, HealthOut(status="ok", database="ok"))
    return Status(
        HTTPStatus.SERVICE_UNAVAILABLE, HealthOut(status="degraded", database="unavailable")
    )
