"""The report a Share link shows: its Project's Tasks as they are now, for a viewer with no account.

The key in the address is the only protection, so an unknown key is not found, while a key whose
link is stopped, expired or whose Project is in Trash only says the link is no longer active.

The report is flat: Sections in List order, each with its open trees first and its Closed trees
after, and every Subtask directly after its parent. Open Tasks are always shown, a Closed Task only
if it was Closed within the link's range, and Tasks in Trash never.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import timedelta
from typing import TYPE_CHECKING

from django.db.models import F, Q
from django.utils import timezone

from apps.accounts.services import local_zone
from apps.tasks import live
from apps.tasks.mentions import plain_names
from apps.tasks.models import CLOSED_STATUSES, OPEN_STATUSES, Attachment, ShareLink, Task
from apps.tasks.rows import overdue
from apps.tasks.sections import project_sections

if TYPE_CHECKING:
    from collections.abc import Iterable
    from datetime import date, datetime, time
    from zoneinfo import ZoneInfo

    from django.db.models import QuerySet

    from apps.tasks.models import Project


@dataclass(frozen=True)
class ReportAttachment:
    """A file on a Task of the report, which the viewer downloads through the link."""

    id: int
    name: str
    size: int


@dataclass(frozen=True)
class ReportTask:
    """One Task as the report shows it, with Mentions as plain names and times on the owner's clock.

    `parent_title` is None for a root; a Subtask carries it because the report is flat.
    """

    id: int
    title: str
    parent_title: str | None
    status: Task.Status
    priority: Task.Priority
    due_date: date | None
    due_time: time | None
    start_date: date | None
    start_time: time | None
    completed_at: datetime | None
    is_overdue: bool
    tags: list[str]
    description: str
    blocked_reason: str
    attachments: list[ReportAttachment]


@dataclass(frozen=True)
class ReportSection:
    """A group of the report's Tasks. A null name holds the Tasks outside any Section."""

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
    """What a Share link shows: its Project, when the report was made, a summary and its Tasks."""

    project: Project
    as_of: datetime
    summary: ReportSummary
    sections: list[ReportSection]


def share_link(key: str) -> ShareLink | None:
    """Return the Share link whose address carries this key, active or not, if any."""
    return ShareLink.objects.select_related("project", "owner").filter(key=key).first()


def shared_attachment(key: str, attachment_id: int) -> Attachment | None:
    """Return the Attachment if the key's link is active and it's on a live Task in its Project.

    Anything else is None, so the key can't fetch a file the report doesn't cover.
    """
    link = share_link(key)
    if link is None or not link.is_active:
        return None
    shared_tasks = live.tasks(link.owner).filter(project=link.project)
    return Attachment.objects.filter(pk=attachment_id, task__in=shared_tasks).first()


def open_report(link: ShareLink) -> Report:
    """Record that the active link was opened, and return its Project's report as of now.

    Times are in the owner's time zone, so the viewer reads the same days the owner does.
    """
    now = timezone.now()
    link.last_opened_at = now
    link.save(update_fields=["last_opened_at"])
    tasks = _shown_tasks(link, now)
    overdue_ids = set(tasks.filter(overdue(link.owner)).values_list("pk", flat=True))
    zone = local_zone(link.owner)
    sections = [
        ReportSection(
            name, [_entry(task, zone, is_overdue=task.pk in overdue_ids) for task in trees]
        )
        for name, trees in _sections(link.project, list(tasks))
    ]
    return Report(
        project=link.project,
        as_of=timezone.localtime(now, zone),
        summary=_summary([task for section in sections for task in section.tasks]),
        sections=sections,
    )


def _summary(shown: list[ReportTask]) -> ReportSummary:
    return ReportSummary(
        completed=sum(task.status == Task.Status.COMPLETED for task in shown),
        total=len(shown),
        blocked=sum(task.status == Task.Status.BLOCKED for task in shown),
        overdue=sum(task.is_overdue for task in shown),
    )


def _shown_tasks(link: ShareLink, now: datetime) -> QuerySet[Task]:
    """Return the Project's live Tasks the report shows: Pinned roots first, then manual order."""
    shown = Q(status__in=OPEN_STATUSES)
    if link.range_days is None:
        shown |= Q(status__in=CLOSED_STATUSES)
    else:
        shown |= Q(completed_at__gte=now - timedelta(days=link.range_days))
    return (
        live.tasks(link.owner)
        .filter(shown, project=link.project)
        .select_related("parent")
        .prefetch_related("tags", "attachments")
        .order_by(F("pinned_at").asc(nulls_last=True), "position", "id")
    )


def _sections(project: Project, tasks: list[Task]) -> list[tuple[str | None, list[Task]]]:
    """Group the Tasks' trees by Section: No section, then each in order, leaving out empty ones."""
    roots_by_section: dict[int | None, list[Task]] = defaultdict(list)
    children: dict[int, list[Task]] = defaultdict(list)
    for task in tasks:
        if task.parent_id is None:
            roots_by_section[task.section_id].append(task)
        else:
            children[task.parent_id].append(task)
    names: list[tuple[int | None, str | None]] = [(None, None)]
    names += [(section.pk, section.name) for section in project_sections(project)]
    return [
        (name, list(_flatten(roots, children)))
        for section_id, name in names
        if (roots := roots_by_section.get(section_id))
    ]


def _flatten(roots: list[Task], children: dict[int, list[Task]]) -> Iterable[Task]:
    """Yield open trees in List order, then Closed trees most recently completed first.

    Each Task comes with its Subtasks directly after it, depth first.
    """
    open_roots = [root for root in roots if root.status in OPEN_STATUSES]
    closed_roots = [root for root in roots if root.status in CLOSED_STATUSES]
    # Every Closed Task has a completed_at; the fallback only satisfies the type.
    closed_roots.sort(key=lambda root: root.completed_at or root.created_at, reverse=True)
    for root in (*open_roots, *closed_roots):
        yield from _tree(root, children)


def _tree(task: Task, children: dict[int, list[Task]]) -> Iterable[Task]:
    yield task
    for child in children.get(task.pk, ()):
        yield from _tree(child, children)


def _entry(task: Task, zone: ZoneInfo, *, is_overdue: bool) -> ReportTask:
    return ReportTask(
        id=task.pk,
        title=plain_names(task.title),
        parent_title=None if task.parent is None else plain_names(task.parent.title),
        status=Task.Status(task.status),
        priority=Task.Priority(task.priority),
        due_date=task.due_date,
        due_time=task.due_time,
        start_date=task.start_date,
        start_time=task.start_time,
        completed_at=None if task.completed_at is None else task.completed_at.astimezone(zone),
        is_overdue=is_overdue,
        tags=[tag.name for tag in task.tags.all()],
        description=plain_names(task.description),
        blocked_reason=plain_names(task.blocked_reason),
        attachments=[
            ReportAttachment(id=file.pk, name=file.name, size=file.size)
            for file in task.attachments.all()
        ],
    )
