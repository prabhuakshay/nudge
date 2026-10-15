"""Django settings for Nudge.

Every value that differs between deployments is read from the environment (or a `.env` file at
the repository root). `.env.example` documents each variable, its default and when to change it.
Nothing here should need editing to deploy Nudge.
"""

from __future__ import annotations

import re
from pathlib import Path
from urllib.parse import urlsplit

import django_stubs_ext
import environ

# Lets generic Django classes such as `ModelAdmin[User]` be subscripted at runtime, matching
# what the type checker sees.
django_stubs_ext.monkeypatch()

BASE_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = BASE_DIR.parent

env = environ.Env()
environ.Env.read_env(REPO_ROOT / ".env")

# ---------------------------------------------------------------- core

DEBUG = env.bool("NUDGE_DEBUG", default=False)

_INSECURE_DEV_SECRET_KEY = "django-insecure-dev-only-never-use-in-production"  # noqa: S105
SECRET_KEY = env.str(
    "NUDGE_SECRET_KEY",
    default=_INSECURE_DEV_SECRET_KEY if DEBUG else environ.Env.NOTSET,
)

# The address people type into their browser, e.g. https://nudge.example.com. Allowed hosts and
# trusted origins default to it, so most deployments only set this one value.
PUBLIC_URL = env.str("NUDGE_PUBLIC_URL", default="http://localhost:8000").rstrip("/")
_public = urlsplit(PUBLIC_URL)
ALLOWED_HOSTS = env.list(
    "NUDGE_ALLOWED_HOSTS",
    default=sorted({_public.hostname or "localhost", "localhost", "127.0.0.1"}),
)
CSRF_TRUSTED_ORIGINS = env.list(
    "NUDGE_CSRF_TRUSTED_ORIGINS",
    default=[f"{_public.scheme}://{_public.netloc}"],
)

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "ninja",
    "procrastinate.contrib.django",
    "apps.core",
    "apps.accounts",
    "apps.notifications",
    "apps.tasks",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

# ---------------------------------------------------------------- database

DATABASES = {
    "default": env.db_url(
        "DATABASE_URL",
        default="postgres://nudge:nudge@localhost:5432/nudge",
    ),
}
DATABASES["default"]["CONN_MAX_AGE"] = env.int("NUDGE_DB_CONN_MAX_AGE", default=60)
DATABASES["default"]["CONN_HEALTH_CHECKS"] = env.bool("NUDGE_DB_CONN_HEALTH_CHECKS", default=True)

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ---------------------------------------------------------------- cache

# Used for rate limiting. The default in-memory cache is per process; use `dbcache://` or a
# shared cache when running more than one web worker and limits must be exact.
CACHES = {"default": env.cache_url("NUDGE_CACHE_URL", default="locmemcache://")}

# ---------------------------------------------------------------- auth

AUTH_USER_MODEL = "accounts.User"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {"min_length": env.int("NUDGE_PASSWORD_MIN_LENGTH", default=10)},
    },
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

SESSION_COOKIE_AGE = env.int("NUDGE_SESSION_COOKIE_AGE", default=60 * 60 * 24 * 14)

# Sign-in attempts allowed per client IP, and password changes per user, e.g. "10/m".
LOGIN_RATE_LIMIT = env.str("NUDGE_LOGIN_RATE_LIMIT", default="10/m")

# Calendar feed fetches allowed per client IP. Calendar apps poll at most every few minutes, so
# this only bites someone guessing feed addresses.
CALENDAR_FEED_RATE_LIMIT = env.str("NUDGE_CALENDAR_FEED_RATE_LIMIT", default="30/m")

# ---------------------------------------------------------------- security

# Caddy (or another proxy) terminates HTTPS and forwards plain HTTP, so Django must trust the
# proxy's headers to know the original request was secure.
TRUST_PROXY_HEADERS = env.bool("NUDGE_TRUST_PROXY_HEADERS", default=False)
if TRUST_PROXY_HEADERS:
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    USE_X_FORWARDED_HOST = True

# How many proxies sit in front of Django, so rate limits see the real client IP from
# X-Forwarded-For instead of the proxy's address.
NINJA_NUM_PROXIES = env.int("NUDGE_NUM_PROXIES", default=1 if TRUST_PROXY_HEADERS else 0)

SECURE_SSL_REDIRECT = env.bool("NUDGE_SECURE_SSL_REDIRECT", default=False)
SECURE_HSTS_SECONDS = env.int("NUDGE_SECURE_HSTS_SECONDS", default=0)
SECURE_HSTS_INCLUDE_SUBDOMAINS = env.bool("NUDGE_SECURE_HSTS_INCLUDE_SUBDOMAINS", default=False)
SECURE_HSTS_PRELOAD = env.bool("NUDGE_SECURE_HSTS_PRELOAD", default=False)
SECURE_REFERRER_POLICY = "same-origin"
SESSION_COOKIE_SECURE = env.bool("NUDGE_SECURE_COOKIES", default=not DEBUG)
CSRF_COOKIE_SECURE = SESSION_COOKIE_SECURE
X_FRAME_OPTIONS = "DENY"

# ---------------------------------------------------------------- i18n

LANGUAGE_CODE = env.str("NUDGE_LANGUAGE_CODE", default="en-us")
TIME_ZONE = env.str("NUDGE_TIME_ZONE", default="UTC")
USE_I18N = True
USE_TZ = True

# ---------------------------------------------------------------- static files and frontend

STATIC_URL = "static/"
STATIC_ROOT = env.path("NUDGE_STATIC_ROOT", default=BASE_DIR / "staticfiles")
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}

# Uploaded files (Attachments). Never served from a public URL: only the owner-checked download
# endpoint reads them. In Docker this is the `media` volume, shared by the web and the worker.
MEDIA_ROOT = Path(env.path("NUDGE_MEDIA_ROOT", default=BASE_DIR / "media"))
# Big uploads are spooled to disk while they arrive. Keep them on the media volume: the
# container's /tmp is RAM, and a read-only container has nowhere else to write.
FILE_UPLOAD_TEMP_DIR = MEDIA_ROOT / "uploads"
# The largest Attachment, in bytes. Keep the proxy's request body limit a little above it.
ATTACHMENT_MAX_SIZE = env.int("NUDGE_ATTACHMENT_MAX_SIZE", default=25 * 1024 * 1024)

# How many days deleted Tasks and Projects wait in Trash before they are gone for good.
TRASH_RETENTION_DAYS = env.int("NUDGE_TRASH_RETENTION_DAYS", default=365)

# The built React app. WhiteNoise serves its files from the site root; `apps.core.views.spa`
# returns its index.html for every other non-API path, `/` included, so client-side routing
# works and index.html is never cached.
FRONTEND_DIST_DIR = Path(
    env.path("NUDGE_FRONTEND_DIST_DIR", default=REPO_ROOT / "frontend" / "dist"),
)
WHITENOISE_ROOT = FRONTEND_DIST_DIR if FRONTEND_DIST_DIR.is_dir() else None

_VITE_HASHED_ASSET = re.compile(r"^/assets/.+-[A-Za-z0-9_-]{8,}\.\w+$")


def immutable_file_test(_path: str, url: str) -> bool:
    """Tell WhiteNoise which files can be cached forever.

    Vite puts a content hash in every file under `/assets/`, so a changed file always gets a
    new URL and browsers never need to revalidate the old one.
    """
    return bool(_VITE_HASHED_ASSET.match(url))


WHITENOISE_IMMUTABLE_FILE_TEST = immutable_file_test

# ---------------------------------------------------------------- features

API_DOCS_ENABLED = env.bool("NUDGE_API_DOCS_ENABLED", default=True)
ADMIN_ENABLED = env.bool("NUDGE_ADMIN_ENABLED", default=True)
ADMIN_URL = env.str("NUDGE_ADMIN_URL", default="admin/")

# ---------------------------------------------------------------- email

_email = env.email_url("NUDGE_EMAIL_URL", default="consolemail://")
_EMAIL_URL_TO_MAILER_OPTION = {
    "EMAIL_HOST": "host",
    "EMAIL_PORT": "port",
    "EMAIL_HOST_USER": "username",
    "EMAIL_HOST_PASSWORD": "password",
    "EMAIL_USE_TLS": "use_tls",
    "EMAIL_USE_SSL": "use_ssl",
    "EMAIL_FILE_PATH": "file_path",
}
MAILERS = {
    "default": {
        "BACKEND": _email["EMAIL_BACKEND"],
        "OPTIONS": {
            option: _email[key]
            for key, option in _EMAIL_URL_TO_MAILER_OPTION.items()
            if _email.get(key) not in (None, "")
        },
    },
}
DEFAULT_FROM_EMAIL = env.str("NUDGE_DEFAULT_FROM_EMAIL", default="Nudge <nudge@localhost>")
SERVER_EMAIL = DEFAULT_FROM_EMAIL

# ---------------------------------------------------------------- push notifications

# VAPID keys identify this server to browsers' push services. Push stays off until both are set;
# `python manage.py generate_vapid_keys` creates a pair.
VAPID_PUBLIC_KEY = env.str("NUDGE_VAPID_PUBLIC_KEY", default="")
VAPID_PRIVATE_KEY = env.str("NUDGE_VAPID_PRIVATE_KEY", default="")
# How push services can reach whoever runs this server: a mailto: or https: URL.
VAPID_SUBJECT = env.str("NUDGE_VAPID_SUBJECT", default=PUBLIC_URL)

# ---------------------------------------------------------------- logging

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "plain": {"format": "{asctime} {levelname} {name}: {message}", "style": "{"},
    },
    "handlers": {
        "console": {"class": "logging.StreamHandler", "formatter": "plain"},
    },
    "root": {"handlers": ["console"], "level": env.str("NUDGE_LOG_LEVEL", default="INFO")},
    "loggers": {
        "django": {
            "handlers": ["console"],
            "level": env.str("NUDGE_DJANGO_LOG_LEVEL", default="WARNING"),
            "propagate": False,
        },
    },
}
