"""Mention tokens: finding them in a Task's texts, checking them and keeping TaskMention in step.

A Mention is stored inline as `[@Name](person:<id>)`, so the text reads correctly anywhere it is
shown, exported or searched. TaskMention rows are derived from those tokens and rebuilt whenever a
Task's texts are saved; they are what the Person view queries.
"""

from __future__ import annotations

import re
from typing import TYPE_CHECKING

from apps.tasks.models import Person, Task, TaskMention

if TYPE_CHECKING:
    from apps.accounts.models import User

MENTION = re.compile(r"\[@([^\]]*)\]\(person:(\d+)\)")

# Every text of a Task that can hold a Mention. Comments join them when they arrive.
TEXT_FIELDS = ("title", "description", "blocked_reason")


class MentionError(Exception):
    """A text mentions a Person the user doesn't have."""


def mentioned_ids(*texts: str) -> set[int]:
    """Return the ids of every Person the texts mention."""
    return {int(match[2]) for text in texts for match in MENTION.finditer(text)}


def check_mentions(user: User, *texts: str) -> None:
    """Make sure every Mention in the texts points at one of the user's People.

    A foreign or unknown id is refused rather than dropped, so the user's text is never quietly
    altered.

    Raises:
        MentionError: A Mention points at a Person the user doesn't have.
    """
    ids = mentioned_ids(*texts)
    if user.people.filter(pk__in=ids).count() != len(ids):
        message = "A mention points at a Person you don't have."
        raise MentionError(message)


def sync_mentions(task: Task) -> None:
    """Rebuild the Task's TaskMention rows from its texts as they are saved now."""
    ids = mentioned_ids(*(getattr(task, field) for field in TEXT_FIELDS))
    task.mentions.exclude(person_id__in=ids).delete()
    TaskMention.objects.bulk_create(
        [TaskMention(task=task, person_id=person_id) for person_id in ids],
        ignore_conflicts=True,
    )


def rewrite_mentions(person: Person, replacement: str) -> list[Task]:
    """Replace every Mention of the Person with `replacement` in the Tasks that mention them.

    Returns the Tasks it changed, saved. Call it inside a transaction.
    """

    def replace(match: re.Match[str]) -> str:
        return replacement if int(match[2]) == person.pk else match[0]

    tasks = list(Task.objects.filter(mentions__person=person))
    for task in tasks:
        for field in TEXT_FIELDS:
            setattr(task, field, MENTION.sub(replace, getattr(task, field)))
    Task.objects.bulk_update(tasks, TEXT_FIELDS)
    return tasks


def token(person: Person) -> str:
    """Return the Mention token for the Person as they are named now."""
    return f"[@{person.name}](person:{person.pk})"
