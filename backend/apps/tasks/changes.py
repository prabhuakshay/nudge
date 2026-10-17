"""What a change to a Task reports back, and the error it raises when it breaks a Task rule.

Every module that changes Tasks shares these, so they sit below all of them.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from apps.core.errors import DomainRuleError

if TYPE_CHECKING:
    from apps.tasks.models import Task
    from apps.tasks.tree import AffectedTask


class TaskRuleError(DomainRuleError):
    """A change that would break a Task rule. The message says which, in the user's words."""


UNDATED_COUNTDOWN = "Only a dated task can be a countdown."


@dataclass(frozen=True)
class TaskChange:
    """A Task after a change, and the Tasks whose Status it changed."""

    task: Task
    affected: list[AffectedTask]
