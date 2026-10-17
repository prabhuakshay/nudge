"""Business rules for Sections: the named, ordered parts of a Project that hold its roots.

A Project's Sections have one order of fractional-indexing keys the server generates; the client
only says which Section a new or moved one follows. Writes to that order lock the Project's row,
as Task moves do, so two writes never produce the same key. The Inbox has no Sections.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from django.db import transaction

from apps.core.errors import DomainRuleError, NotFoundError
from apps.tasks import live
from apps.tasks.archive import ensure_writable
from apps.tasks.models import SECTION_NAME_MAX_LENGTH, Project, Section
from apps.tasks.siblings import section_siblings

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


def project_section(project: Project, section_id: int) -> Section:
    """Return the Project's Section with this id.

    Raises:
        NotFoundError: The Project has no such Section.
    """
    found = project.sections.filter(pk=section_id).first()
    if found is None:
        raise NotFoundError(live.SECTION_NOT_FOUND)
    return found


def project_sections(project: Project) -> QuerySet[Section]:
    """Return the Project's Sections in order."""
    return project.sections.order_by("position", "id")


def create_section(project: Project, name: str, after_id: int | None = None) -> Section:
    """Create an expanded Section right after the owner's Section `after_id`, or last for None.

    Raises:
        NotFoundError: `after_id` isn't one of the owner's live Sections.
        ArchivedProjectError: The Project is archived.
        SectionRuleError: The Project is the Inbox, the name is blank or too long, or `after`
            is in another Project.
    """
    if project.is_inbox:
        raise SectionRuleError(INBOX_HAS_NO_SECTIONS)
    ensure_writable(project)
    cleaned = clean_name(name)
    after = None if after_id is None else live.section(project.owner, after_id)
    if after is not None and after.project_id != project.pk:
        raise SectionRuleError(NOT_IN_THIS_PROJECT)
    with transaction.atomic():
        siblings = section_siblings(project.pk)
        position = siblings.last() if after is None else siblings.after(after.pk)
        return Section.objects.create(
            owner=project.owner,
            project=project,
            name=cleaned,
            position=position,
        )


def update_section(
    user: User,
    section_id: int,
    *,
    name: str | None = None,
    collapsed: bool | None = None,
) -> Section:
    """Rename one of the user's live Sections, or collapse or expand it.

    Fields left as None stay as they are.

    Raises:
        NotFoundError: The Section isn't one of the user's.
        ArchivedProjectError: The Section's Project is archived.
        SectionRuleError: The new name is blank or too long.
    """
    found = live.section(user, section_id)
    ensure_writable(found.project)
    if name is not None:
        found.name = clean_name(name)
    if collapsed is not None:
        found.collapsed = collapsed
    found.save(update_fields=["name", "collapsed", "updated_at"])
    return found


def move_section(user: User, section_id: int, after_id: int | None) -> None:
    """Put one of the user's live Sections right after the Section `after_id`, or first for None.

    Raises:
        NotFoundError: Either Section isn't one of the user's.
        ArchivedProjectError: The Section's Project is archived.
        SectionRuleError: `after` is in another Project.
    """
    moved = live.section(user, section_id)
    after = None if after_id is None else live.section(user, after_id)
    ensure_writable(moved.project)
    if after is not None and after.project_id != moved.project_id:
        raise SectionRuleError(NOT_IN_THIS_PROJECT)
    with transaction.atomic():
        siblings = section_siblings(moved.project_id)
        moved.position = siblings.after(None if after is None else after.pk, moving=moved.pk)
        moved.save(update_fields=["position", "updated_at"])


def delete_section(user: User, section_id: int) -> None:
    """Delete one of the user's live Sections for good. Its Tasks stay, in No section.

    Raises:
        NotFoundError: The Section isn't one of the user's.
        ArchivedProjectError: The Section's Project is archived.
    """
    found = live.section(user, section_id)
    ensure_writable(found.project)
    found.delete()
