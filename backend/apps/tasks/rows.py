"""How Tasks are read for a list: each row carries its Tags, counts, depth and overdue flag."""

from __future__ import annotations

from typing import TYPE_CHECKING

from django.db.models import (
    BooleanField,
    Case,
    Count,
    ExpressionWrapper,
    OuterRef,
    Q,
    Subquery,
    When,
)
from django.db.models.functions import Coalesce
from django.utils import timezone

from apps.accounts.services import local_zone
from apps.tasks.models import Attachment, Comment

if TYPE_CHECKING:
    from datetime import datetime

    from django.db.models import QuerySet

    from apps.accounts.models import User
    from apps.tasks.models import Task


def _count(model: type[Attachment | Comment]) -> Coalesce:
    """Return how many rows of the model belong to each Task, as an annotation."""
    # A subquery rather than a join: grouping would drop the model's default ordering.
    rows = (
        model.objects.filter(task=OuterRef("pk"))
        .order_by()
        .values("task")
        .annotate(count=Count("pk"))
        .values("count")
    )
    return Coalesce(Subquery(rows), 0)


def with_counts(tasks: QuerySet[Task]) -> QuerySet[Task]:
    """Annotate each Task with `attachment_count` and `comment_count`."""
    return tasks.annotate(attachment_count=_count(Attachment), comment_count=_count(Comment))


def local_now(user: User) -> datetime:
    """Return the time right now on the user's clock."""
    return timezone.now().astimezone(local_zone(user))


def overdue(user: User) -> Q:
    """Return the condition for a Task being overdue, judged by the user's clock right now.

    Times are floating, so the comparison is on the user's local date and time: an all-day Task
    is overdue once its day ends, a timed one once its time passes, a range once its end passes.
    """
    now = local_now(user)
    return Q(completed_at__isnull=True) & (
        Q(due_date__lt=now.date()) | Q(due_date=now.date(), due_time__lt=now.time())
    )


def with_overdue(tasks: QuerySet[Task], user: User) -> QuerySet[Task]:
    """Annotate each Task with `is_overdue`, judged by the user's clock right now."""
    return tasks.annotate(is_overdue=Case(When(overdue(user), then=True), default=False))


def as_rows(tasks: QuerySet[Task], user: User) -> QuerySet[Task]:
    """Return the Tasks with everything a list row shows, judged by the user's clock."""
    # Three hops reach a root from the deepest Subtask, so a row's depth costs no queries.
    tasks = tasks.select_related("parent__parent__parent").prefetch_related("tags")
    return with_overdue(with_counts(tasks), user)


def unpinned() -> ExpressionWrapper[Q]:
    """Return whether a Task isn't Pinned, as an expression: ordering by it puts Pinned first."""
    return ExpressionWrapper(Q(pinned_at__isnull=True), output_field=BooleanField())
