"""Tests for the shared colour palette."""

from __future__ import annotations

import json
from pathlib import Path

from apps.core.palette import PaletteColor

BRAND_TOKENS = Path(__file__).resolve().parents[4] / "branding" / "colors" / "tokens.json"


def test_palette_lists_the_eight_hue_keys() -> None:
    assert PaletteColor.values == [
        "red",
        "orange",
        "amber",
        "green",
        "teal",
        "blue",
        "violet",
        "pink",
    ]


def test_palette_matches_the_brand_hue_tokens() -> None:
    tokens = json.loads(BRAND_TOKENS.read_text())
    brand_hues = [
        name.removeprefix("hue-")
        for name in tokens
        if name.startswith("hue-") and not name.endswith("-soft")
    ]

    assert brand_hues == PaletteColor.values
