"""Models for Tasks, the Projects and Tags that organise them and the People they mention.

One module per domain area; everything is re-exported here so Django finds the models and callers
import from `apps.tasks.models`.
"""

from __future__ import annotations

from apps.tasks.models.activity import TaskActivity
from apps.tasks.models.attachments import Attachment
from apps.tasks.models.comments import Comment
from apps.tasks.models.people import Person, TaskMention
from apps.tasks.models.projects import INBOX_NAME, Folder, Project
from apps.tasks.models.reminders import Reminder
from apps.tasks.models.tags import Tag
from apps.tasks.models.tasks import CLOSED_STATUSES, MAX_DEPTH, OPEN_STATUSES, Task

__all__ = [
    "CLOSED_STATUSES",
    "INBOX_NAME",
    "MAX_DEPTH",
    "OPEN_STATUSES",
    "Attachment",
    "Comment",
    "Folder",
    "Person",
    "Project",
    "Reminder",
    "Tag",
    "Task",
    "TaskActivity",
    "TaskMention",
]
