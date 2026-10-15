"""Database models for Tasks and the Projects that hold them."""

from __future__ import annotations

from typing import ClassVar, override

from django.conf import settings
from django.db import models
from django.db.models import Q
from django.db.models.functions import Lower
from django.utils import timezone

from apps.core.palette import PaletteColor

INBOX_NAME = "Inbox"


class Folder(models.Model):
    """A named, one-level group of Projects in the sidebar.

    Folders and ungrouped Projects share the sidebar's top level, so their `position` keys come
    from one sequence; see `Project`.
    """

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="folders",
    )
    name = models.CharField(max_length=64)
    position = models.CharField(max_length=255, db_collation="C")
    collapsed = models.BooleanField(default=False)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        """Model options."""

        ordering = ("position", "id")

    @override
    def __str__(self) -> str:
        """Return the name, which is how the user tells Folders apart."""
        return self.name


class Project(models.Model):
    """A named container of Tasks owned by one user.

    Every user has exactly one Inbox: a real Project row flagged `is_inbox`, so a Task always
    has a Project and every Project query works the same for the Inbox. The Inbox sits outside
    the sidebar's ordering, so its `position` is unused.

    `position` is a fractional-indexing key among the Project's siblings: the Projects of its
    Folder, or, for an ungrouped Project, the sidebar's top level of Folders and Projects.
    """

    class Icon(models.TextChoices):
        """The Lucide icons a Project can show. Only the Inbox shows the `inbox` icon."""

        INBOX = "inbox", "Inbox"
        LIST = "list", "List"
        BRIEFCASE = "briefcase", "Briefcase"
        HOUSE = "house", "House"
        HEART_PULSE = "heart-pulse", "Heart"
        ROCKET = "rocket", "Rocket"
        BOOK_OPEN = "book-open", "Book"
        HAMMER = "hammer", "Hammer"
        SHOPPING_CART = "shopping-cart", "Shopping cart"
        PLANE = "plane", "Plane"
        GRADUATION_CAP = "graduation-cap", "Graduation cap"
        DUMBBELL = "dumbbell", "Dumbbell"
        MUSIC = "music", "Music"
        CAMERA = "camera", "Camera"
        CODE = "code", "Code"
        PALETTE = "palette", "Palette"
        WALLET = "wallet", "Wallet"
        PIGGY_BANK = "piggy-bank", "Piggy bank"
        GIFT = "gift", "Gift"
        CAR = "car", "Car"
        UTENSILS = "utensils", "Cutlery"
        COFFEE = "coffee", "Coffee"
        LEAF = "leaf", "Leaf"
        SUN = "sun", "Sun"
        MOON = "moon", "Moon"
        STAR = "star", "Star"
        FLAG = "flag", "Flag"
        TARGET = "target", "Target"
        LIGHTBULB = "lightbulb", "Light bulb"
        CALENDAR = "calendar", "Calendar"
        USERS = "users", "People"
        USER = "user", "Person"
        BABY = "baby", "Baby"
        DOG = "dog", "Dog"
        GAMEPAD = "gamepad-2", "Game controller"
        FILM = "film", "Film"
        PENCIL = "pencil", "Pencil"
        WRENCH = "wrench", "Wrench"
        GLOBE = "globe", "Globe"
        MAIL = "mail", "Mail"
        PHONE = "phone", "Phone"

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="projects",
    )
    name = models.CharField(max_length=64)
    color = models.CharField(max_length=16, choices=PaletteColor)
    icon = models.CharField(max_length=32, choices=Icon)
    folder = models.ForeignKey(
        Folder,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="projects",
    )
    position = models.CharField(max_length=255, db_collation="C", blank=True)
    is_inbox = models.BooleanField(default=False)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        """Model options."""

        constraints: ClassVar = [
            models.UniqueConstraint(
                fields=["owner"],
                condition=Q(is_inbox=True),
                name="tasks_project_one_inbox_per_owner",
            ),
            models.UniqueConstraint(
                "owner",
                Lower("name"),
                condition=Q(deleted_at__isnull=True, is_inbox=False),
                name="tasks_project_live_name_ci_unique",
            ),
        ]

    @override
    def __str__(self) -> str:
        """Return the name, which is how the user tells Projects apart."""
        return self.name


class Task(models.Model):
    """One thing to do, owned by one user and living in one of their Projects.

    `position` is a fractional-indexing key: a new Task gets a key between its neighbours, so
    reordering writes one row. Keys compare byte by byte, hence the C collation.
    """

    class Status(models.TextChoices):
        """Where a Task stands."""

        OPEN = "open", "Open"
        COMPLETED = "completed", "Completed"

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="tasks",
    )
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="tasks")
    position = models.CharField(max_length=255, db_collation="C")
    title = models.CharField(max_length=500)
    description = models.TextField(blank=True, default="")
    status = models.CharField(max_length=16, choices=Status, default=Status.OPEN)
    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        """Model options."""

        ordering = ("position", "id")
        indexes: ClassVar = [
            models.Index(fields=["project", "position"], name="task_project_position_idx"),
            models.Index(fields=["project", "-completed_at"], name="task_project_completed_idx"),
        ]
        constraints: ClassVar = [
            models.CheckConstraint(
                condition=Q(status="open", completed_at__isnull=True)
                | Q(status="completed", completed_at__isnull=False),
                name="tasks_task_completed_at_matches_status",
            ),
        ]

    @override
    def __str__(self) -> str:
        """Return the title, which is what the user sees in every list."""
        return self.title


class TaskActivity(models.Model):
    """One event in a Task's history, written by a service in the same transaction as the change.

    `data` holds the event's details, shaped per `kind`; `apps.tasks.schemas` types each shape.
    """

    class Kind(models.TextChoices):
        """What happened to the Task."""

        CREATED = "created", "Created"
        TITLE_CHANGED = "title_changed", "Title changed"
        DESCRIPTION_EDITED = "description_edited", "Description edited"
        MOVED = "moved", "Moved"

    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name="activity")
    kind = models.CharField(max_length=32, choices=Kind)
    at = models.DateTimeField(default=timezone.now)
    data = models.JSONField(default=dict, blank=True)

    class Meta:
        """Model options."""

        verbose_name_plural = "task activity"
        indexes: ClassVar = [
            models.Index(fields=["task", "-at", "-id"], name="task_activity_newest_idx"),
        ]

    @override
    def __str__(self) -> str:
        """Return what happened, which is how the admin lists events."""
        return self.get_kind_display()
