"""People in a user's address book and the Tasks that mention them."""

from __future__ import annotations

from typing import ClassVar, override

from django.conf import settings
from django.db import models
from django.db.models.functions import Lower
from django.utils import timezone

from apps.core.palette import PaletteColor
from apps.tasks.models.tasks import Task


class Person(models.Model):
    """A name in one user's private address book, which their Tasks can mention.

    A Person is never an account: nobody signs in as one or hears about a Mention.
    """

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="people",
    )
    name = models.CharField(max_length=64)
    color = models.CharField(max_length=16, choices=PaletteColor)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        """Model options."""

        verbose_name_plural = "people"
        ordering = (Lower("name"), "id")
        constraints: ClassVar = [
            models.UniqueConstraint(
                "owner",
                Lower("name"),
                name="tasks_person_name_ci_unique",
            ),
        ]

    @override
    def __str__(self) -> str:
        """Return the name, which is how the user tells People apart."""
        return self.name


class TaskMention(models.Model):
    """A Task that mentions a Person somewhere in its texts.

    Derived data: `apps.tasks.mentions.sync_mentions` rebuilds a Task's rows from its texts
    whenever they are saved, so the Person view never has to scan text.
    """

    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name="mentions")
    person = models.ForeignKey(Person, on_delete=models.CASCADE, related_name="mentions")

    class Meta:
        """Model options."""

        constraints: ClassVar = [
            models.UniqueConstraint(fields=["task", "person"], name="tasks_mention_unique"),
        ]

    @override
    def __str__(self) -> str:
        """Return who is mentioned where."""
        return f"{self.person} in {self.task}"
