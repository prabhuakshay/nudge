"""The errors the domain raises: a rule refusing a change, or an id naming nothing the user has."""

from __future__ import annotations


class DomainRuleError(Exception):
    """A request the domain's rules refuse. Its message says why, in the user's words.

    The API answers any of these with 422 and the message, so endpoints don't catch them.
    """


class NotFoundError(Exception):
    """An id that names nothing the user has. Its message says what wasn't found.

    Another user's id is not found too, so nobody learns which ids exist. The API answers any of
    these with 404 and the message, so endpoints don't catch them.
    """
