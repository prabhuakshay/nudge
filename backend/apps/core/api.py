"""HTTP endpoints for the core app."""

from __future__ import annotations

from typing import TYPE_CHECKING

from ninja import Router, Status

from apps.core import services
from apps.core.schemas import HealthOut

if TYPE_CHECKING:
    from django.http import HttpRequest

router = Router()

_HTTP_SERVICE_UNAVAILABLE = 503


@router.get(
    "/health",
    response={200: HealthOut, _HTTP_SERVICE_UNAVAILABLE: HealthOut},
    auth=None,
    summary="Check service health",
)
def health(request: HttpRequest) -> Status[HealthOut]:
    """Report whether the API and its database are working."""
    if services.database_is_available():
        return Status(200, HealthOut(status="ok", database="ok"))
    return Status(_HTTP_SERVICE_UNAVAILABLE, HealthOut(status="degraded", database="unavailable"))
