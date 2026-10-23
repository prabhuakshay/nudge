"""Tests for the rules that pick where Attachments are stored."""

from __future__ import annotations

import pytest
from django.core.exceptions import ImproperlyConfigured

from config import storage

BUCKET_SETTINGS = {
    "NUDGE_STORAGE_BUCKET": "nudge",
    "NUDGE_STORAGE_ENDPOINT_URL": "https://account.r2.cloudflarestorage.com",
    "NUDGE_STORAGE_ACCESS_KEY_ID": "key-id",
    "NUDGE_STORAGE_SECRET_ACCESS_KEY": "secret",
}


def test_without_a_bucket_files_stay_on_the_file_system() -> None:
    assert storage.default_storage({}) == {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
    }


def test_empty_values_count_as_unset() -> None:
    settings = dict.fromkeys(BUCKET_SETTINGS, "")

    assert storage.default_storage(settings) == {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
    }


def test_a_full_bucket_configuration_stores_files_in_the_bucket() -> None:
    assert storage.default_storage({**BUCKET_SETTINGS, "NUDGE_STORAGE_REGION": "eu-west-1"}) == {
        "BACKEND": "storages.backends.s3.S3Storage",
        "OPTIONS": {
            "bucket_name": "nudge",
            "endpoint_url": "https://account.r2.cloudflarestorage.com",
            "access_key": "key-id",
            "secret_key": "secret",
            "region_name": "eu-west-1",
        },
    }


def test_the_region_defaults_to_auto() -> None:
    options = storage.default_storage(BUCKET_SETTINGS)["OPTIONS"]

    assert isinstance(options, dict)
    assert options["region_name"] == "auto"


@pytest.mark.parametrize("given", ["NUDGE_STORAGE_BUCKET", "NUDGE_STORAGE_ACCESS_KEY_ID"])
def test_a_partial_configuration_names_every_missing_setting(given: str) -> None:
    missing = sorted(set(BUCKET_SETTINGS) - {given}, key=list(BUCKET_SETTINGS).index)

    with pytest.raises(ImproperlyConfigured) as error:
        storage.default_storage({given: BUCKET_SETTINGS[given]})

    assert str(error.value) == f"Set {', '.join(missing)} to store Attachments in a bucket."
