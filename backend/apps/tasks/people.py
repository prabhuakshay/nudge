"""Business rules for People: the address book, the Person view, and renames, deletes and merges.

A Mention stores the Person's name inside the Task's text, so exports, search and the Calendar
feed read correctly without a lookup. That makes every rename, delete and merge a rewrite of the
texts that mention the Person, done in the same transaction as the change itself.
"""

from __future__ import annotations

import secrets
from typing import TYPE_CHECKING

from django.db import IntegrityError, transaction

from apps.core.palette import PaletteColor
from apps.tasks.mentions import rewrite_mentions, token
from apps.tasks.models import (
    CLOSED_STATUSES,
    OPEN_STATUSES,
    Person,
    Task,
    TaskActivity,
    TaskMention,
)
from apps.tasks.pagination import Page, newest_first
from apps.tasks.rows import as_rows

if TYPE_CHECKING:
    from django.db.models import QuerySet

    from apps.accounts.models import User


class PersonRuleError(Exception):
    """A change to a Person breaks one of the rules People follow."""


def people(user: User) -> QuerySet[Person]:
    """Return the user's People, A to Z regardless of case."""
    return user.people.all()


def person(user: User, person_id: int) -> Person | None:
    """Return one of the user's People, or None."""
    return user.people.filter(pk=person_id).first()


def _save(found: Person) -> None:
    """Save the Person, turning a clash with another Person's name into a rule error."""
    try:
        with transaction.atomic():
            found.save()
    except IntegrityError as error:
        message = f"You already have a Person named “{found.name}”."
        raise PersonRuleError(message) from error


def create_person(user: User, name: str, *, color: PaletteColor | None = None) -> Person:
    """Add a Person to the user's address book, in a random palette colour by default.

    Raises:
        PersonRuleError: The user already has a Person with that name, in any case.
    """
    created = Person(owner=user, name=name, color=color or secrets.choice(PaletteColor.values))
    _save(created)
    return created


def update_person(
    user: User,
    person_id: int,
    *,
    name: str | None = None,
    color: PaletteColor | None = None,
) -> Person | None:
    """Rename or recolour one of the user's People; None if it isn't theirs.

    A rename rewrites every Mention of the Person to the new name.

    Raises:
        PersonRuleError: The new name belongs to another of the user's People.
    """
    found = person(user, person_id)
    if found is None:
        return None
    renamed = name is not None and name != found.name
    found.name = name if name is not None else found.name
    found.color = color or found.color
    with transaction.atomic():
        _save(found)
        if renamed:
            rewrite_mentions(found, token(found))
    return found


def delete_person(user: User, person_id: int) -> bool:
    """Delete one of the user's People for good; False if it isn't theirs.

    Their Mentions become plain `@Name` text, so old Tasks still read correctly.
    """
    found = person(user, person_id)
    if found is None:
        return False
    with transaction.atomic():
        rewrite_mentions(found, f"@{found.name}")
        found.delete()
    return True


def merge_person(user: User, person_id: int, into_id: int) -> Person | None:
    """Fold one of the user's People into another, and return the one that's left.

    Every Mention of the first becomes a Mention of the second, each Task that changes records
    the merge in its Activity, and the first Person is deleted. None if either isn't theirs.

    Raises:
        PersonRuleError: The two are the same Person.
    """
    source, target = person(user, person_id), person(user, into_id)
    if source is None or target is None:
        return None
    if source.pk == target.pk:
        message = "A Person can't be merged into themselves."
        raise PersonRuleError(message)
    with transaction.atomic():
        tasks = rewrite_mentions(source, token(target))
        TaskMention.objects.bulk_create(
            [TaskMention(task=task, person=target) for task in tasks],
            ignore_conflicts=True,
        )
        data = {"from_person": source.name, "to_person": target.name}
        TaskActivity.objects.bulk_create(
            TaskActivity(task=task, kind=TaskActivity.Kind.PERSON_MERGED, data=data)
            for task in tasks
        )
        source.delete()
    return target


def _mentioning(found: Person) -> QuerySet[Task]:
    """Return the live Tasks that mention the Person, as list rows.

    Only the Task whose own text holds the Mention counts: a Subtask's Mention never pulls in its
    parent. Tasks in a deleted Project stay out with their Project.
    """
    tasks = Task.objects.filter(
        mentions__person=found,
        deleted_at__isnull=True,
        project__deleted_at__isnull=True,
    )
    return as_rows(tasks, found.owner)


def open_tasks(found: Person) -> QuerySet[Task]:
    """Return the open and Blocked Tasks that mention the Person, in each Project's manual order."""
    return _mentioning(found).filter(status__in=OPEN_STATUSES)


def closed_tasks(found: Person, cursor: str | None = None) -> Page[Task]:
    """Return a page of the Closed Tasks that mention the Person, most recently completed first.

    Raises:
        InvalidCursorError: The cursor wasn't one this function returned.
    """
    closed = _mentioning(found).filter(status__in=CLOSED_STATUSES)
    return newest_first(closed, "completed_at", cursor)
