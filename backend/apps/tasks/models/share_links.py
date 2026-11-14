"""Share links: private, read-only addresses that show one Project to someone without an account."""

from __future__ import annotations

from typing import override

from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.tasks.models.projects import Project


class ShareLink(models.Model):
    """A private address that shows one Project's report to whoever has it, without signing in.

    The `key` in the address is its only protection, so it is long and random. A link works while
    it is active: not stopped, not expired and its Project not in Trash. Stopping a link keeps the
    row, so its address answers "no longer active" rather than "not found".
    """

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="share_links",
    )
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="share_links")
    key = models.CharField(max_length=64, unique=True)
    expires_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the link stops working. Empty means never.",
    )
    range_days = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="How many days back each Task's timeline goes. Empty means all.",
    )
    created_at = models.DateTimeField(default=timezone.now)
    last_opened_at = models.DateTimeField(null=True, blank=True)
    stopped_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        """Model options."""

        ordering = ("created_at", "id")

    @override
    def __str__(self) -> str:
        """Return which Project the link shares, since its key is a secret."""
        return f"Share link to {self.project.name}"

    @property
    def url(self) -> str:
        """The public address of the link's report page."""
        return f"{settings.PUBLIC_URL}/share/{self.key}"

    @property
    def is_active(self) -> bool:
        """Whether the link shows its report: not stopped, not expired, its Project not in Trash."""
        if self.stopped_at is not None or self.project.deleted_at is not None:
            return False
        return self.expires_at is None or timezone.now() < self.expires_at
