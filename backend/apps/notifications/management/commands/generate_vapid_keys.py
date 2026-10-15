"""Management command that creates the VAPID key pair push notifications need."""

from __future__ import annotations

from base64 import urlsafe_b64encode
from typing import override

from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from django.core.management.base import BaseCommand

_PRIVATE_KEY_BYTES = 32


def _b64url(data: bytes) -> str:
    return urlsafe_b64encode(data).rstrip(b"=").decode()


class Command(BaseCommand):
    """Print a new VAPID key pair as `.env` lines."""

    help = "Generate VAPID keys for push notifications and print them as .env lines."

    @override
    def handle(self, *args: object, **options: object) -> None:
        """Generate a P-256 key pair in the raw, base64url form browsers and pywebpush use."""
        key = ec.generate_private_key(ec.SECP256R1())
        private = key.private_numbers().private_value.to_bytes(_PRIVATE_KEY_BYTES, "big")
        public = key.public_key().public_bytes(Encoding.X962, PublicFormat.UncompressedPoint)
        self.stdout.write(f"NUDGE_VAPID_PUBLIC_KEY={_b64url(public)}")
        self.stdout.write(f"NUDGE_VAPID_PRIVATE_KEY={_b64url(private)}")
