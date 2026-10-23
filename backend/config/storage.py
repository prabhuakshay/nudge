"""Where Attachments are stored: the server's file system, or an S3-compatible bucket.

`settings.py` evaluates once at import, so the rules live here, where tests can call them.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from django.core.exceptions import ImproperlyConfigured

if TYPE_CHECKING:
    from collections.abc import Mapping

_BUCKET_SETTING_TO_OPTION = {
    "NUDGE_STORAGE_BUCKET": "bucket_name",
    "NUDGE_STORAGE_ENDPOINT_URL": "endpoint_url",
    "NUDGE_STORAGE_ACCESS_KEY_ID": "access_key",
    "NUDGE_STORAGE_SECRET_ACCESS_KEY": "secret_key",
}

# A file read from the bucket is downloaded whole before Django streams it. Above this size it
# spills to FILE_UPLOAD_TEMP_DIR instead of staying in RAM; the backend's default is never.
# Matches Django's FILE_UPLOAD_MAX_MEMORY_SIZE default, so reads and uploads behave alike.
_MAX_MEMORY_SIZE = 2_621_440


def default_storage(environ: Mapping[str, str]) -> dict[str, str | dict[str, str | int]]:
    """Return the `default` entry of `STORAGES` that the `NUDGE_STORAGE_*` values describe.

    With none of the bucket settings, files stay on the file system under `MEDIA_ROOT`. With
    all of them, files go to the bucket. Some but not all is a mistake worth stopping for, so
    Nudge doesn't start writing to the wrong place.

    Raises:
        ImproperlyConfigured: Some bucket settings are set but others are missing.
    """
    given = {name: environ.get(name, "") for name in _BUCKET_SETTING_TO_OPTION}
    if not any(given.values()):
        return {"BACKEND": "django.core.files.storage.FileSystemStorage"}
    if missing := [name for name, value in given.items() if not value]:
        message = f"Set {', '.join(missing)} to store Attachments in a bucket."
        raise ImproperlyConfigured(message)
    options: dict[str, str | int] = {
        _BUCKET_SETTING_TO_OPTION[name]: value for name, value in given.items()
    }
    # R2 takes "auto"; other services need their real region.
    options["region_name"] = environ.get("NUDGE_STORAGE_REGION") or "auto"
    options["max_memory_size"] = _MAX_MEMORY_SIZE
    return {"BACKEND": "storages.backends.s3.S3Storage", "OPTIONS": options}
