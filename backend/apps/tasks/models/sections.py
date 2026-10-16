"""Sections: the named, ordered parts of a Project that hold its root Tasks."""

from __future__ import annotations

from typing import override

from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.tasks.models.projects import Project

SECTION_NAME_MAX_LENGTH = 64


class Section(models.Model):
    """A named part of one Project that holds some of its root Tasks.

    `position` is a fractional-indexing key among the Project's Sections. A Section holds no
    content of its own, so it is deleted for good and its Tasks fall back to No section.
    """

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="sections",
    )
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="sections")
    name = models.CharField(max_length=SECTION_NAME_MAX_LENGTH)
    position = models.CharField(max_length=255, db_collation="C")
    collapsed = models.BooleanField(default=False)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        """Model options."""

        ordering = ("position", "id")

    @override
    def __str__(self) -> str:
        """Return the name, which is how the user tells Sections apart."""
        return self.name
