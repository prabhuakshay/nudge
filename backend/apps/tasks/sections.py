"""Business rules for Sections: the named, ordered groups of root Tasks inside a Project.

A Project's Sections have one order of fractional-indexing keys the server generates; the client
only says which Section a new or moved one follows. Writes to that order lock the Project's row,
as Task moves do, so two writes never produce the same key. The Inbox has no Sections.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from django.db import transaction
from fractional_indexing import generate_key_between

from apps.core.errors import DomainRuleError
from apps.tasks.models import SECTION_NAME_MAX_LENGTH, Project, Section
from apps.tasks.positions import key_after, lock_project

if TYPE_CHECKING:
    from django.db.models import QuerySet

    from apps.accounts.models import User


class SectionRuleError(DomainRuleError):
    """A change to a Section breaks one of the rules Sections follow."""


INBOX_HAS_NO_SECTIONS = "The Inbox has no Sections."
NAME_IS_BLANK = "A Section needs a name."
NAME_IS_TOO_LONG = f"A Section's name can be at most {SECTION_NAME_MAX_LENGTH} characters."
NOT_IN_THIS_PROJECT = "That Section is in another Project."


def clean_name(name: str) -> str:
    """Return the name without surrounding spaces.

    Raises:
        SectionRuleError: The name is blank or too long.
    """
    cleaned = name.strip()
    if not cleaned:
        raise SectionRuleError(NAME_IS_BLANK)
    if len(cleaned) > SECTION_NAME_MAX_LENGTH:
        raise SectionRuleError(NAME_IS_TOO_LONG)
    return cleaned


def section(user: User, section_id: int) -> Section | None:
    """Return one of the user's Sections, or None."""
    return user.sections.filter(pk=section_id).first()


def project_sections(project: Project) -> QuerySet[Section]:
    """Return the Project's Sections in order."""
    return project.sections.order_by("position", "id")


def _sibling_keys(project: Project) -> list[tuple[int, str]]:
    return list(project_sections(project).values_list("pk", "position"))


def create_section(project: Project, name: str, after: Section | None = None) -> Section:
    """Create an expanded Section right after `after`, or last when there is none.

    Raises:
        SectionRuleError: The Project is the Inbox, the name is blank or too long, or `after`
            is in another Project.
    """
    if project.is_inbox:
        raise SectionRuleError(INBOX_HAS_NO_SECTIONS)
    cleaned = clean_name(name)
    if after is not None and after.project_id != project.pk:
        raise SectionRuleError(NOT_IN_THIS_PROJECT)
    with transaction.atomic():
        lock_project(project.pk)
        siblings = _sibling_keys(project)
        if after is not None:
            position = key_after(siblings, after.pk)
        else:
            position = str(generate_key_between(siblings[-1][1] if siblings else None, None))
        return Section.objects.create(
            owner=project.owner,
            project=project,
            name=cleaned,
            position=position,
        )


def update_section(
    found: Section,
    *,
    name: str | None = None,
    collapsed: bool | None = None,
) -> Section:
    """Rename a Section, or collapse or expand it; fields left as None stay as they are.

    Raises:
        SectionRuleError: The new name is blank or too long.
    """
    if name is not None:
        found.name = clean_name(name)
    if collapsed is not None:
        found.collapsed = collapsed
    found.save()
    return found


def move_section(moved: Section, after: Section | None) -> None:
    """Put a Section right after `after`, or first when there is none.

    Raises:
        SectionRuleError: `after` is in another Project.
    """
    if after is not None and after.project_id != moved.project_id:
        raise SectionRuleError(NOT_IN_THIS_PROJECT)
    with transaction.atomic():
        lock_project(moved.project_id)
        siblings = [sibling for sibling in _sibling_keys(moved.project) if sibling[0] != moved.pk]
        moved.position = key_after(siblings, None if after is None else after.pk)
        moved.save(update_fields=["position", "updated_at"])


def delete_section(user: User, section_id: int) -> bool:
    """Delete one of the user's Sections; False if there's none.

    Its Tasks stay in the Project, in No section.
    """
    deleted, _ = user.sections.filter(pk=section_id).delete()
    return deleted > 0
