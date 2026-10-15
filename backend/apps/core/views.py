"""Plain Django views for the core app."""

from __future__ import annotations

from typing import TYPE_CHECKING

from django.conf import settings
from django.http import HttpResponse, HttpResponseNotFound, JsonResponse

if TYPE_CHECKING:
    from django.http import HttpRequest


def spa(_request: HttpRequest) -> HttpResponse:
    """Return the React app's index.html so the browser-side router can render the path."""
    index = settings.FRONTEND_DIST_DIR / "index.html"
    if not index.is_file():
        return HttpResponseNotFound(
            "The frontend has not been built. Run `npm run build` in frontend/.",
            content_type="text/plain",
        )
    response = HttpResponse(index.read_bytes(), content_type="text/html; charset=utf-8")
    # index.html references hashed asset files, so it must always be revalidated to pick up
    # a new deploy.
    response["Cache-Control"] = "no-cache"
    return response


def api_not_found(_request: HttpRequest) -> JsonResponse:
    """Answer unknown `/api/` paths with JSON, matching every other API error."""
    return JsonResponse({"detail": "Not Found"}, status=404)
