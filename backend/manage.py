#!/usr/bin/env python
"""Django's command-line entry point."""

from __future__ import annotations

import os
import sys


def main() -> None:
    """Run a Django management command."""
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
    from django.core.management import execute_from_command_line  # noqa: PLC0415

    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()
