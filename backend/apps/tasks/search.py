"""Search: find the user's Tasks whose title, Description or one Comment holds every word.

Matching is a case-insensitive substring test per word (`ILIKE`), kept behind `search_tasks` so
full-text search can replace it without changing the API. Archived Projects are searched too;
Trash never is.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from enum import StrEnum
from functools import reduce
from operator import and_
from typing import TYPE_CHECKING

from django.db.models import Case, F, OuterRef, Q, Subquery, TextField, When

from apps.tasks import live
from apps.tasks.mentions import MENTION
from apps.tasks.models import OPEN_STATUSES, Comment, Task
from apps.tasks.rows import as_rows

if TYPE_CHECKING:
    from apps.accounts.models import User

MAX_RESULTS = 50

# How much text a snippet keeps around the first matched word, in characters.
_SNIPPET_BEFORE = 40
_SNIPPET_LENGTH = 160


class MatchIn(StrEnum):
    """Where a Task matched, best first: a title match outranks a Description or Comment one."""

    TITLE = "title"
    DESCRIPTION = "description"
    COMMENT = "comment"


@dataclass(frozen=True)
class SearchHit:
    """A Task that matched, where it matched, and a plain-text snippet of the matching text."""

    task: Task
    match_in: MatchIn
    snippet: str


def _holds_every_word(field: str, words: list[str]) -> Q:
    return reduce(and_, (Q(**{f"{field}__icontains": word}) for word in words))


def search_tasks(user: User, q: str) -> list[SearchHit]:
    """Return up to `MAX_RESULTS` of the user's Tasks that hold every word of `q`.

    Open and Blocked Tasks come before Closed ones, then title matches before Description matches
    before Comment matches, then the most recently changed first.
    """
    words = q.split()
    in_title = _holds_every_word("title", words)
    in_description = _holds_every_word("description", words)
    comments = Comment.objects.filter(_holds_every_word("body", words), task=OuterRef("pk"))
    first_comment = Subquery(comments.order_by("created_at", "id").values("body")[:1])
    matches = (
        live.tasks(user)
        .annotate(
            matched_comment=first_comment,
            match_rank=Case(When(in_title, then=0), When(in_description, then=1), default=2),
            matched_text=Case(
                When(in_title, then=F("title")),
                When(in_description, then=F("description")),
                default=F("matched_comment"),
                output_field=TextField(),
            ),
            is_closed=Case(When(status__in=OPEN_STATUSES, then=0), default=1),
        )
        .filter(in_title | in_description | Q(matched_comment__isnull=False))
        .order_by("is_closed", "match_rank", "-updated_at", "-pk")
        .values_list("pk", "match_rank", "matched_text")[:MAX_RESULTS]
    )
    found = list(matches)
    rows = as_rows(Task.objects.filter(pk__in=[pk for pk, _, _ in found]), user).in_bulk()
    match_in = list(MatchIn)
    return [
        SearchHit(task=rows[pk], match_in=match_in[rank], snippet=_snippet(text, words))
        for pk, rank, text in found
    ]


def _snippet(text: str, words: list[str]) -> str:
    """Return the text as one plain line, cut down to the part around the first matched word.

    Mentions read as `@Name`. Text cut off at either end is marked with an ellipsis.
    """
    plain = " ".join(MENTION.sub(r"@\1", text).split())
    pattern = "|".join(re.escape(word) for word in words)
    found = re.search(pattern, plain, re.IGNORECASE)
    start = max(0, (found.start() if found else 0) - _SNIPPET_BEFORE)
    end = start + _SNIPPET_LENGTH
    cut = plain[start:end].strip()
    return f"{'…' if start > 0 else ''}{cut}{'…' if end < len(plain) else ''}"
