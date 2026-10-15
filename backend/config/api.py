"""The project's single Django Ninja API instance, mounted at `/api/v1/`.

Each app exposes a `router` in its `api.py`; register it here so the whole API shares one
OpenAPI schema, which the frontend's typed client is generated from.

Every endpoint requires a signed-in session unless it opts out with `auth=None`, so new
endpoints are private by default.
"""

from __future__ import annotations

from django.conf import settings
from ninja import NinjaAPI
from ninja.security import django_auth

from apps.accounts.api import router as accounts_router
from apps.core.api import router as core_router
from apps.notifications.api import router as notifications_router
from apps.tasks.api.attachments import router as attachments_router
from apps.tasks.api.calendar import router as calendar_router
from apps.tasks.api.folders import router as folders_router
from apps.tasks.api.people import router as people_router
from apps.tasks.api.projects import router as projects_router
from apps.tasks.api.sidebar import router as sidebar_router
from apps.tasks.api.tasks import router as tasks_router

api = NinjaAPI(
    title="Nudge API",
    version="1.0.0",
    description="HTTP API for Nudge, an open-source, self-hostable task manager.",
    docs_url="/docs" if settings.API_DOCS_ENABLED else None,
    openapi_url="/openapi.json" if settings.API_DOCS_ENABLED else None,
    auth=django_auth,
)

api.add_router("/", core_router, tags=["core"])
api.add_router("/auth", accounts_router, tags=["auth"])
api.add_router("/notifications", notifications_router, tags=["notifications"])
api.add_router("/folders", folders_router, tags=["folders"])
api.add_router("/projects", projects_router, tags=["projects"])
api.add_router("/people", people_router, tags=["people"])
api.add_router("/sidebar", sidebar_router, tags=["sidebar"])
api.add_router("/tasks", tasks_router, tags=["tasks"])
api.add_router("/", attachments_router, tags=["attachments"])
api.add_router("/calendar", calendar_router, tags=["calendar"])
