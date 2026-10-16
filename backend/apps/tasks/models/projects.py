"""Folders and the Projects they group."""

from __future__ import annotations

from typing import ClassVar, override

from django.conf import settings
from django.db import models
from django.db.models import Q
from django.db.models.functions import Lower
from django.utils import timezone

from apps.core.palette import PaletteColor

INBOX_NAME = "Inbox"
PROJECT_NAME_MAX_LENGTH = 64


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
    collapsed = models.BooleanField(default=True)
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

    A Project in Trash records when in `deleted_at`, and shares its `trash_unit` with the Tasks
    deleted along with it.
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

    class Layout(models.TextChoices):
        """How the Project page draws its Tasks."""

        LIST = "list", "List"
        BOARD = "board", "Board"

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="projects",
    )
    name = models.CharField(max_length=PROJECT_NAME_MAX_LENGTH)
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
    layout = models.CharField(max_length=16, choices=Layout, default=Layout.LIST)
    archived_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)
    deleted_at = models.DateTimeField(null=True, blank=True)
    trash_unit = models.UUIDField(null=True, blank=True, db_index=True)

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

    @property
    def is_archived(self) -> bool:
        """Whether the Project is archived, and so read-only."""
        return self.archived_at is not None
