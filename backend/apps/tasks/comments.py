"""Business rules for Comments: markdown notes on a Task that can mention the user's People.

Comments are reached only through the user's own live Tasks, so another user's ids, and Comments
on a Task in Trash, behave as if they don't exist. Every change rebuilds the Task's Mentions,
and none is recorded in Activity.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from django.db import transaction
from django.utils import timezone

from apps.tasks.archive import ensure_writable
from apps.tasks.mentions import check_mentions, sync_mentions
from apps.tasks.models import Comment

if TYPE_CHECKING:
    from django.db.models import QuerySet

    from apps.accounts.models import User
    from apps.tasks.models import Task


def comments(task: Task) -> QuerySet[Comment]:
    """Return the Task's Comments, oldest first."""
    return task.comments.all()


def add_comment(task: Task, body: str) -> Comment:
    """Add a Comment to the Task.

    Raises:
        MentionError: The body mentions a Person the Task's owner doesn't have.
        ArchivedProjectError: The Task is in an archived Project.
    """
    ensure_writable(task.project)
    check_mentions(task.owner, body)
    now = timezone.now()
    with transaction.atomic():
        comment = Comment.objects.create(task=task, body=body, created_at=now, updated_at=now)
        sync_mentions(task)
    return comment


def _live_comment(user: User, comment_id: int) -> Comment | None:
    return (
        Comment.objects.select_related("task__project")
        .filter(pk=comment_id, task__owner=user, task__deleted_at__isnull=True)
        .first()
    )


def edit_comment(user: User, comment_id: int, body: str) -> Comment | None:
    """Change the body of one of the user's Comments; None if it isn't theirs.

    Raises:
        MentionError: The body mentions a Person the user doesn't have.
        ArchivedProjectError: The Comment's Task is in an archived Project.
    """
    comment = _live_comment(user, comment_id)
    if comment is None:
        return None
    ensure_writable(comment.task.project)
    check_mentions(user, body)
    comment.body = body
    comment.updated_at = timezone.now()
    with transaction.atomic():
        comment.save(update_fields=["body", "updated_at"])
        sync_mentions(comment.task)
    return comment


def delete_comment(user: User, comment_id: int) -> bool:
    """Delete one of the user's Comments for good; False if it isn't theirs.

    Raises:
        ArchivedProjectError: The Comment's Task is in an archived Project.
    """
    comment = _live_comment(user, comment_id)
    if comment is None:
        return False
    ensure_writable(comment.task.project)
    with transaction.atomic():
        comment.delete()
        sync_mentions(comment.task)
    return True
