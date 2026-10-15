"""Tests for the notifications management commands."""

from __future__ import annotations

from base64 import urlsafe_b64decode
from io import StringIO

from cryptography.hazmat.primitives.asymmetric import ec
from django.core.management import call_command


def _b64url_decode(value: str) -> bytes:
    return urlsafe_b64decode(value + "=" * (-len(value) % 4))


def test_generate_vapid_keys_prints_a_matching_key_pair() -> None:
    output = StringIO()

    call_command("generate_vapid_keys", stdout=output)

    lines = dict(line.split("=", 1) for line in output.getvalue().splitlines())
    public = _b64url_decode(lines["NUDGE_VAPID_PUBLIC_KEY"])
    private = int.from_bytes(_b64url_decode(lines["NUDGE_VAPID_PRIVATE_KEY"]))
    derived = ec.derive_private_key(private, ec.SECP256R1()).public_key()
    assert derived == ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), public)
