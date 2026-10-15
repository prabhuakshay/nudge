"""Top-level URL routes.

`/api/v1/` goes to Django Ninja, the admin lives at a configurable path, and every other path
returns the React app so client-side routing can take over.
"""

from __future__ import annotations

import re

from django.conf import settings
from django.contrib import admin
from django.urls import URLPattern, URLResolver, path, re_path

from apps.core.views import api_not_found, spa
from config.api import api

_reserved = ["api/", "static/"]
urlpatterns: list[URLPattern | URLResolver] = [
    path("api/v1/", api.urls),
    re_path(r"^api/", api_not_found),
]

if settings.ADMIN_ENABLED:
    _reserved.append(settings.ADMIN_URL)
    urlpatterns.append(path(settings.ADMIN_URL, admin.site.urls))

_not_reserved = "|".join(re.escape(prefix) for prefix in _reserved)
urlpatterns.append(re_path(rf"^(?!{_not_reserved}).*$", spa, name="spa"))
