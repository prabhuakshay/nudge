"""The project's single Django Ninja API instance, mounted at `/api/v1/`.

Each app exposes a `router` in its `api.py`; register it here so the whole API shares one
OpenAPI schema, which the frontend's typed client is generated from.

Every endpoint requires a signed-in session unless it opts out with `auth=None`, so new
endpoints are private by default. A `DomainRuleError` raised anywhere becomes a 422 answer and a
`NotFoundError` a 404 one.
"""

from __future__ import annotations

from http import HTTPStatus
from typing import TYPE_CHECKING

from django.conf import settings
from ninja import NinjaAPI
from ninja.security import django_auth

from apps.accounts.api import router as accounts_router
from apps.core.api import router as core_router
from apps.core.errors import DomainRuleError, NotFoundError
from apps.habits.api import reminder_actions_router as habit_reminder_actions_router
from apps.habits.api import router as habits_router
from apps.notifications.api import router as notifications_router
from apps.tasks.api.activity import router as activity_router
from apps.tasks.api.attachments import router as attachments_router
from apps.tasks.api.bulk import router as bulk_router
from apps.tasks.api.calendar import router as calendar_router
from apps.tasks.api.calendar_view import router as calendar_view_router
from apps.tasks.api.comments import router as comments_router
from apps.tasks.api.folders import router as folders_router
from apps.tasks.api.people import router as people_router
from apps.tasks.api.projects import router as projects_router
from apps.tasks.api.reminder_actions import router as reminder_actions_router
from apps.tasks.api.search import router as search_router
from apps.tasks.api.sections import router as sections_router
from apps.tasks.api.sidebar import router as sidebar_router
from apps.tasks.api.tags import router as tags_router
from apps.tasks.api.tasks import router as tasks_router
from apps.tasks.api.trash import router as trash_router

if TYPE_CHECKING:
    from django.http import HttpRequest, HttpResponse

api = NinjaAPI(
    title="Nudge API",
    version="1.0.0",
    description="HTTP API for Nudge, an open-source, self-hostable task manager.",
    docs_url="/docs" if settings.API_DOCS_ENABLED else None,
    openapi_url="/openapi.json" if settings.API_DOCS_ENABLED else None,
    auth=django_auth,
)


@api.exception_handler(DomainRuleError)
def refused(request: HttpRequest, error: DomainRuleError) -> HttpResponse:
    """Answer a change the domain's rules refuse with 422 and the reason, as `ErrorOut` does."""
    return api.create_response(
        request,
        {"detail": str(error)},
        status=HTTPStatus.UNPROCESSABLE_ENTITY,
    )


@api.exception_handler(NotFoundError)
def not_found(request: HttpRequest, error: NotFoundError) -> HttpResponse:
    """Answer an id that names nothing the user has with 404 and what wasn't found."""
    return api.create_response(request, {"detail": str(error)}, status=HTTPStatus.NOT_FOUND)


api.add_router("/", core_router, tags=["core"])
api.add_router("/auth", accounts_router, tags=["auth"])
api.add_router("/notifications", notifications_router, tags=["notifications"])
api.add_router("/notifications", reminder_actions_router, tags=["notifications"])
api.add_router("/notifications", habit_reminder_actions_router, tags=["notifications"])
api.add_router("/folders", folders_router, tags=["folders"])
api.add_router("/projects", projects_router, tags=["projects"])
api.add_router("/", sections_router, tags=["sections"])
api.add_router("/people", people_router, tags=["people"])
api.add_router("/sidebar", sidebar_router, tags=["sidebar"])
api.add_router("/tags", tags_router, tags=["tags"])
api.add_router("/", bulk_router, tags=["tasks"])
api.add_router("/tasks", tasks_router, tags=["tasks"])
api.add_router("/tasks", search_router, tags=["tasks"])
api.add_router("/tasks", activity_router, tags=["tasks"])
api.add_router("/tasks", calendar_view_router, tags=["tasks"])
api.add_router("/", attachments_router, tags=["attachments"])
api.add_router("/", comments_router, tags=["comments"])
api.add_router("/calendar", calendar_router, tags=["calendar"])
api.add_router("/", trash_router, tags=["trash"])
api.add_router("/habits", habits_router, tags=["habits"])
