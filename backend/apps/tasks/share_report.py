"""The report a Share link shows: its Project's Tasks as they are now, for a viewer with no account.

The key in the address is the only protection, so an unknown key is not found, while a key whose
link is stopped, expired or whose Project is in Trash only says the link is no longer active.

The report is Sections in List order, each with its open trees first and its Closed trees after,
and every Task carrying its Subtasks. Open Tasks are always shown, a Closed Task only if it was
Closed within the link's range, and Tasks in Trash never. Each Task carries its Comments within the
range, oldest first.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import timedelta
from typing import TYPE_CHECKING

from django.db.models import F, Q
from django.utils import timezone

from apps.accounts.services import local_zone
from apps.core.errors import NotFoundError
from apps.tasks import live
from apps.tasks.attachments import ATTACHMENT_NOT_FOUND
from apps.tasks.mentions import plain_names
from apps.tasks.models import (
    CLOSED_STATUSES,
    OPEN_STATUSES,
    Attachment,
    Comment,
    ShareLink,
    Task,
)
from apps.tasks.rows import overdue
from apps.tasks.sections import project_sections
from apps.tasks.share_links import SHARE_LINK_NOT_FOUND
from apps.tasks.tree import ancestors

if TYPE_CHECKING:
    from datetime import date, datetime, time
    from zoneinfo import ZoneInfo

    from django.db.models import QuerySet

    from apps.tasks.models import Project


@dataclass(frozen=True)
class ReportComment:
    """A Comment on a Task of the report."""

    id: int
    at: datetime
    body: str


@dataclass(frozen=True)
class ReportAttachment:
    """A file on a Task of the report, which the viewer downloads through the link."""

    id: int
    name: str
    size: int


@dataclass(frozen=True)
class ReportTask:
    """One Task as the report shows it, with its Subtasks and Mentions as plain names."""

    id: int
    title: str
    status: Task.Status
    priority: Task.Priority
    due_date: date | None
    due_time: time | None
    start_date: date | None
    start_time: time | None
    is_overdue: bool
    tags: list[str]
    description: str
    blocked_reason: str
    attachments: list[ReportAttachment]
    comments: list[ReportComment]
    subtasks: list[ReportTask]


@dataclass(frozen=True)
class ReportSection:
    """A group of the report's Task trees. A null name holds the Tasks outside any Section."""

    name: str | None
    tasks: list[ReportTask]


@dataclass(frozen=True)
class ReportSummary:
    """How the report's Tasks stand, counted over every Task it shows, Subtasks included."""

    completed: int
    total: int
    blocked: int
    overdue: int


@dataclass(frozen=True)
class Report:
    """What a Share link shows: its Project, a summary and its Tasks."""

    project: Project
    summary: ReportSummary
    sections: list[ReportSection]


NO_LONGER_ACTIVE = "This link is no longer active."


class InactiveShareLinkError(Exception):
    """A key whose Share link is stopped, expired or whose Project is in Trash."""


def shared_attachment(key: str, attachment_id: int) -> Attachment:
    """Return the Attachment if the key's link is active and it's on a Task the report shows.

    Raises:
        NotFoundError: Anything else, so the key can't fetch a file the report doesn't cover and
            an inactive link says nothing about what it held.
    """
    link = _share_link(key)
    attachment = None
    if link is not None and link.is_active:
        shown = _shown_tasks(link, _range_start(link, timezone.now()))
        attachment = Attachment.objects.filter(pk=attachment_id, task__in=shown).first()
    if attachment is None:
        raise NotFoundError(ATTACHMENT_NOT_FOUND)
    return attachment


def open_report(key: str) -> Report:
    """Record that the key's link was opened, and return its Project's report as of now.

    Times are in the owner's time zone, so the viewer reads the same days the owner does.

    Raises:
        NotFoundError: No Share link has this key.
        InactiveShareLinkError: The link is no longer active.
    """
    link = _share_link(key)
    if link is None:
        raise NotFoundError(SHARE_LINK_NOT_FOUND)
    if not link.is_active:
        raise InactiveShareLinkError(NO_LONGER_ACTIVE)
    now = timezone.now()
    link.last_opened_at = now
    link.save(update_fields=["last_opened_at"])
    since = _range_start(link, now)
    tasks = _shown_tasks(link, since)
    overdue_ids = set(tasks.filter(overdue(link.owner)).values_list("pk", flat=True))
    shown = list(tasks)
    comments = _comments(shown, since, local_zone(link.owner))
    roots_by_section, children = _trees(link.project, shown)

    def entry(task: Task) -> ReportTask:
        return _entry(
            task,
            is_overdue=task.pk in overdue_ids,
            comments=comments.get(task.pk, []),
            subtasks=[entry(child) for child in children.get(task.pk, [])],
        )

    return Report(
        project=link.project,
        summary=_summary(shown, overdue_ids),
        sections=[
            ReportSection(name, [entry(root) for root in roots]) for name, roots in roots_by_section
        ],
    )


def _share_link(key: str) -> ShareLink | None:
    """Return the Share link whose address carries this key, active or not, if any."""
    return ShareLink.objects.select_related("project", "owner").filter(key=key).first()


def _summary(shown: list[Task], overdue_ids: set[int]) -> ReportSummary:
    return ReportSummary(
        completed=sum(task.status == Task.Status.COMPLETED for task in shown),
        total=len(shown),
        blocked=sum(task.status == Task.Status.BLOCKED for task in shown),
        overdue=len(overdue_ids),
    )


def _range_start(link: ShareLink, now: datetime) -> datetime | None:
    """Return when the link's range begins as of now; None when it shows all."""
    return None if link.range_days is None else now - timedelta(days=link.range_days)


def _shown_tasks(link: ShareLink, since: datetime | None) -> QuerySet[Task]:
    """Return the Project's live Tasks the report shows: Pinned roots first, then manual order."""
    shown = Q(status__in=OPEN_STATUSES)
    if since is None:
        shown |= Q(status__in=CLOSED_STATUSES)
    else:
        shown |= Q(completed_at__gte=since)
    return (
        live.tasks(link.owner)
        .filter(shown, project=link.project)
        .select_related("parent__parent__parent")
        .prefetch_related("tags", "attachments")
        .order_by(F("pinned_at").asc(nulls_last=True), "position", "id")
    )


def _comments(
    tasks: list[Task], since: datetime | None, zone: ZoneInfo
) -> dict[int, list[ReportComment]]:
    """Return each Task's Comments since the range began, oldest first, by Task id."""
    found = Comment.objects.filter(task__in=tasks).order_by("created_at", "id")
    if since is not None:
        found = found.filter(created_at__gte=since)
    by_task: dict[int, list[ReportComment]] = defaultdict(list)
    for comment in found:
        by_task[comment.task_id].append(
            ReportComment(
                comment.pk, comment.created_at.astimezone(zone), plain_names(comment.body)
            )
        )
    return by_task


def _trees(
    project: Project, tasks: list[Task]
) -> tuple[list[tuple[str | None, list[Task]]], dict[int, list[Task]]]:
    """Return the roots by Section, No section first and empty ones left out, and each's Subtasks.

    A tree's Section is its root's, even when the root itself isn't shown.
    """
    shown_ids = {task.pk for task in tasks}
    roots_by_section: dict[int | None, list[Task]] = defaultdict(list)
    children: dict[int, list[Task]] = defaultdict(list)
    for task in tasks:
        above = ancestors(task)
        # A Subtask Closed within the range can sit under a parent Closed before it, which the
        # report hides; it then hangs from its nearest shown ancestor, or stands as a root.
        shown_above = [ancestor for ancestor in above if ancestor.pk in shown_ids]
        if shown_above:
            children[shown_above[-1].pk].append(task)
        else:
            roots_by_section[(above[0] if above else task).section_id].append(task)
    names: list[tuple[int | None, str | None]] = [(None, None)]
    names += [(section.pk, section.name) for section in project_sections(project)]
    sections = [
        (name, _ordered(roots))
        for section_id, name in names
        if (roots := roots_by_section.get(section_id))
    ]
    return sections, children


def _ordered(roots: list[Task]) -> list[Task]:
    """Return open roots in List order, then Closed roots most recently completed first."""
    open_roots = [root for root in roots if root.status in OPEN_STATUSES]
    closed_roots = [root for root in roots if root.status in CLOSED_STATUSES]
    # Every Closed Task has a completed_at; the fallback only satisfies the type.
    closed_roots.sort(key=lambda root: root.completed_at or root.created_at, reverse=True)
    return open_roots + closed_roots


def _entry(
    task: Task,
    *,
    is_overdue: bool,
    comments: list[ReportComment],
    subtasks: list[ReportTask],
) -> ReportTask:
    return ReportTask(
        id=task.pk,
        title=plain_names(task.title),
        status=Task.Status(task.status),
        priority=Task.Priority(task.priority),
        due_date=task.due_date,
        due_time=task.due_time,
        start_date=task.start_date,
        start_time=task.start_time,
        is_overdue=is_overdue,
        tags=[tag.name for tag in task.tags.all()],
        description=plain_names(task.description),
        blocked_reason=plain_names(task.blocked_reason),
        attachments=[
            ReportAttachment(id=file.pk, name=file.name, size=file.size)
            for file in task.attachments.all()
        ],
        comments=comments,
        subtasks=subtasks,
    )
