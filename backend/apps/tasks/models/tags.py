"""Tags, the flat labels a user puts on Tasks."""

from __future__ import annotations

from typing import ClassVar, override

from django.conf import settings
from django.db import models
from django.db.models import Q
from django.db.models.functions import Lower
from django.utils import timezone

from apps.core.palette import PaletteColor


class Tag(models.Model):
    """A flat label a user puts on Tasks across their Projects.

    Tasks link to a Tag by id, so renaming it shows everywhere at once. Names have no spaces or
    `#`, because Quick add reads `#name` as a Tag. `position` is a fractional-indexing key in the
    user's manual order, and an empty `color` shows grey. A deleted Tag is gone for good.
    """

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="tags",
    )
    name = models.CharField(max_length=64)
    color = models.CharField(max_length=16, choices=PaletteColor, blank=True, default="")
    position = models.CharField(max_length=255, db_collation="C")
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        """Model options."""

        ordering = ("position", "id")
        constraints: ClassVar = [
            models.UniqueConstraint("owner", Lower("name"), name="tasks_tag_name_ci_unique"),
            models.CheckConstraint(
                condition=~Q(name="") & ~Q(name__regex=r"[\s#]"),
                name="tasks_tag_name_one_word",
            ),
        ]

    @override
    def __str__(self) -> str:
        """Return the name, which is how the user tells Tags apart."""
        return self.name
