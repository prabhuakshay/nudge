"""Fixtures shared by every test in the backend."""

from __future__ import annotations

from typing import TYPE_CHECKING

import boto3
import pytest
from moto import mock_aws

from config import storage

if TYPE_CHECKING:
    from collections.abc import Callable, Iterator

    from pytest_django import Settings

BUCKET = "nudge-test"


@pytest.fixture(autouse=True)
def _plain_static_files_storage(settings: Settings) -> None:
    """Skip WhiteNoise's manifest lookup, which needs collectstatic to have run."""
    settings.STORAGES = {
        **settings.STORAGES,
        "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
    }


@pytest.fixture
def bucket(settings: Settings) -> Iterator[Callable[[], list[str]]]:
    """Store Attachments in a fake, empty S3 bucket; return a function listing its keys."""
    with mock_aws():
        client = boto3.client("s3", region_name="us-east-1")
        client.create_bucket(Bucket=BUCKET)
        settings.STORAGES = {
            **settings.STORAGES,
            "default": storage.default_storage(
                {
                    "NUDGE_STORAGE_BUCKET": BUCKET,
                    "NUDGE_STORAGE_ENDPOINT_URL": "https://s3.amazonaws.com",
                    "NUDGE_STORAGE_ACCESS_KEY_ID": "test-key-id",
                    "NUDGE_STORAGE_SECRET_ACCESS_KEY": "test-secret",
                    "NUDGE_STORAGE_REGION": "us-east-1",
                },
            ),
        }

        def keys() -> list[str]:
            listing = client.list_objects_v2(Bucket=BUCKET)
            return sorted(item["Key"] for item in listing.get("Contents", []))

        yield keys
