"""Business rules for Comments: markdown notes on a Task that can mention the user's People.

Comments are reached only through the user's own live Tasks, so another user's ids, and Comments
on a Task in Trash, behave as if they don't exist. Every change rebuilds the Task's Mentions,
and none is recorded in Activity.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from django.db import transaction
from django.utils import timezone

from apps.core.errors import NotFoundError
from apps.tasks import live
from apps.tasks.archive import ensure_writable
from apps.tasks.mentions import check_mentions, sync_mentions
from apps.tasks.models import Comment

if TYPE_CHECKING:
    from django.db.models import QuerySet

    from apps.accounts.models import User

COMMENT_NOT_FOUND = "Comment not found."


def comments(user: User, task_id: int) -> QuerySet[Comment]:
    """Return the Comments on one of the user's live Tasks, oldest first.

    Raises:
        NotFoundError: The Task isn't one of the user's.
    """
    return live.task(user, task_id).comments.all()


def add_comment(user: User, task_id: int, body: str) -> Comment:
    """Add a Comment to one of the user's live Tasks.

    Raises:
        NotFoundError: The Task isn't one of the user's.
        MentionError: The body mentions a Person the user doesn't have.
        ArchivedProjectError: The Task is in an archived Project.
    """
    task = live.task(user, task_id)
    ensure_writable(task.project)
    check_mentions(user, body)
    now = timezone.now()
    with transaction.atomic():
        comment = Comment.objects.create(task=task, body=body, created_at=now, updated_at=now)
        sync_mentions(task)
    return comment


def _live_comment(user: User, comment_id: int) -> Comment:
    comment = (
        Comment.objects.select_related("task__project")
        .filter(pk=comment_id, task__in=live.tasks(user))
        .first()
    )
    if comment is None:
        raise NotFoundError(COMMENT_NOT_FOUND)
    return comment


def edit_comment(user: User, comment_id: int, body: str) -> Comment:
    """Change the body of one of the user's Comments on a live Task.

    Raises:
        NotFoundError: The Comment isn't one of the user's.
        MentionError: The body mentions a Person the user doesn't have.
        ArchivedProjectError: The Comment's Task is in an archived Project.
    """
    comment = _live_comment(user, comment_id)
    ensure_writable(comment.task.project)
    check_mentions(user, body)
    comment.body = body
    comment.updated_at = timezone.now()
    with transaction.atomic():
        comment.save(update_fields=["body", "updated_at"])
        sync_mentions(comment.task)
    return comment


def delete_comment(user: User, comment_id: int) -> None:
    """Delete one of the user's Comments on a live Task for good.

    Raises:
        NotFoundError: The Comment isn't one of the user's.
        ArchivedProjectError: The Comment's Task is in an archived Project.
    """
    comment = _live_comment(user, comment_id)
    ensure_writable(comment.task.project)
    with transaction.atomic():
        comment.delete()
        sync_mentions(comment.task)
