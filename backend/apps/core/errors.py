"""The error every domain rule raises when it refuses a change."""

from __future__ import annotations


class DomainRuleError(Exception):
    """A request the domain's rules refuse. Its message says why, in the user's words.

    The API answers any of these with 422 and the message, so endpoints don't catch them.
    """
