"""Models for Tasks, the Projects and Tags that organise them and the People they mention."""

from __future__ import annotations

import uuid
from typing import ClassVar, override

from django.conf import settings
from django.db import models
from django.db.models import F, Q
from django.db.models.functions import Lower
from django.utils import timezone

from apps.core.palette import PaletteColor

INBOX_NAME = "Inbox"
# Tasks nest four levels deep: a root at depth 0 and Subtasks down to depth 3.
MAX_DEPTH = 3


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
    archived_at = models.DateTimeField(null=True, blank=True)
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

    @property
    def is_archived(self) -> bool:
        """Whether the Project is archived, and so read-only."""
        return self.archived_at is not None


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


class Task(models.Model):
    """One thing to do, owned by one user and living in one of their Projects.

    `position` is a fractional-indexing key: a new Task gets a key between its neighbours, so
    reordering writes one row. Keys compare byte by byte, hence the C collation. Keys are scoped
    to a sibling set: the roots of one Project, or the Subtasks of one parent.

    A Subtask always lives in its root's Project, and Tasks nest at most `MAX_DEPTH` levels below
    a root. A Closed Task never has open descendants; the services keep it that way.

    Dates are floating: a time means that clock time in the owner's `time_zone`, wherever it is,
    so 09:00 stays 09:00 when the user travels. A due date without a time is all-day; a start
    date turns the Task into a range that ends on the due date.

    Completed and Won't do are Closed and record when in `completed_at`. Blocked is still open
    work, and only a Blocked Task keeps a `blocked_reason`. A pinned Task records when in
    `pinned_at` and lists above the rest, oldest pin first.
    """

    class Status(models.TextChoices):
        """Where a Task stands."""

        OPEN = "open", "Open"
        COMPLETED = "completed", "Completed"
        WONT_DO = "wont_do", "Won't do"
        BLOCKED = "blocked", "Blocked"

    class Priority(models.IntegerChoices):
        """How urgent a Task is; P1 is the most urgent."""

        NONE = 0, "None"
        P1 = 1, "P1"
        P2 = 2, "P2"
        P3 = 3, "P3"
        P4 = 4, "P4"

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="tasks",
    )
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="tasks")
    parent = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="subtasks",
    )
    position = models.CharField(max_length=255, db_collation="C")
    title = models.CharField(max_length=500)
    description = models.TextField(blank=True, default="")
    status = models.CharField(max_length=16, choices=Status, default=Status.OPEN)
    blocked_reason = models.TextField(blank=True, default="")
    priority = models.PositiveSmallIntegerField(choices=Priority, default=Priority.NONE)
    completed_at = models.DateTimeField(null=True, blank=True)
    pinned_at = models.DateTimeField(null=True, blank=True)
    due_date = models.DateField(null=True, blank=True)
    due_time = models.TimeField(null=True, blank=True, help_text="Empty for an all-day Task.")
    start_date = models.DateField(null=True, blank=True, help_text="Set for a range.")
    start_time = models.TimeField(null=True, blank=True)
    tags = models.ManyToManyField(Tag, blank=True, related_name="tasks")
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        """Model options."""

        ordering = ("position", "id")
        indexes: ClassVar = [
            models.Index(fields=["project", "position"], name="task_project_position_idx"),
            models.Index(fields=["project", "-completed_at"], name="task_project_completed_idx"),
            models.Index(fields=["parent", "position"], name="task_parent_position_idx"),
        ]
        constraints: ClassVar = [
            models.CheckConstraint(
                condition=Q(status__in=["open", "blocked"], completed_at__isnull=True)
                | Q(status__in=["completed", "wont_do"], completed_at__isnull=False),
                name="tasks_task_completed_at_matches_status",
            ),
            models.CheckConstraint(
                condition=Q(start_date__isnull=True) | Q(due_date__isnull=False),
                name="tasks_task_start_needs_due",
            ),
            models.CheckConstraint(
                condition=(Q(due_time__isnull=True) | Q(due_date__isnull=False))
                & (Q(start_time__isnull=True) | Q(start_date__isnull=False)),
                name="tasks_task_time_needs_its_date",
            ),
            models.CheckConstraint(
                condition=Q(start_date__isnull=True)
                | Q(start_time__isnull=True, due_time__isnull=True)
                | Q(start_time__isnull=False, due_time__isnull=False),
                name="tasks_task_range_all_day_or_timed",
            ),
            models.CheckConstraint(
                condition=Q(start_date__isnull=True)
                | Q(start_date__lt=F("due_date"))
                | Q(start_date=F("due_date"), start_time__isnull=True)
                | Q(start_date=F("due_date"), start_time__lte=F("due_time")),
                name="tasks_task_range_starts_by_due",
            ),
            models.CheckConstraint(
                condition=Q(status="blocked") | Q(blocked_reason=""),
                name="tasks_task_blocked_reason_needs_blocked",
            ),
        ]

    @override
    def __str__(self) -> str:
        """Return the title, which is what the user sees in every list."""
        return self.title

    @property
    def depth(self) -> int:
        """Return how many parents the Task has: 0 for a root, up to `MAX_DEPTH`."""
        depth, parent = 0, self.parent
        while parent is not None:
            depth, parent = depth + 1, parent.parent
        return depth

    @property
    def parent_title(self) -> str | None:
        """Return the parent's title, which flat lists show as a breadcrumb; None for a root."""
        return None if self.parent is None else self.parent.title


# Blocked work is still to be done, so it sorts and counts with open Tasks.
OPEN_STATUSES = (Task.Status.OPEN, Task.Status.BLOCKED)
CLOSED_STATUSES = (Task.Status.COMPLETED, Task.Status.WONT_DO)


class TaskActivity(models.Model):
    """One event in a Task's history, written by a service in the same transaction as the change.

    `data` holds the event's details, shaped per `kind`; `apps.tasks.schemas.activity` types
    each shape.
    """

    class Kind(models.TextChoices):
        """What happened to the Task."""

        CREATED = "created", "Created"
        TITLE_CHANGED = "title_changed", "Title changed"
        DESCRIPTION_EDITED = "description_edited", "Description edited"
        DATES_CHANGED = "dates_changed", "Dates changed"
        STATUS_CHANGED = "status_changed", "Status changed"
        PRIORITY_CHANGED = "priority_changed", "Priority changed"
        PINNED = "pinned", "Pinned"
        UNPINNED = "unpinned", "Unpinned"
        ATTACHMENT_ADDED = "attachment_added", "Attachment added"
        ATTACHMENT_REMOVED = "attachment_removed", "Attachment removed"
        MOVED = "moved", "Moved"
        TAG_ADDED = "tag_added", "Tag added"
        TAG_REMOVED = "tag_removed", "Tag removed"
        TAGS_MERGED = "tags_merged", "Tags merged"
        PERSON_MERGED = "person_merged", "Person merged"
        REMINDERS_CHANGED = "reminders_changed", "Reminders changed"

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


class Reminder(models.Model):
    """A nudge at a set offset from a Task's start (for a range) or due date and time.

    `offset` is signed, like an iCalendar alarm trigger: negative is before. An all-day Task counts
    from the start of its day, so +9 h is 09:00 on the day. `fire_at` is when the Reminder fires
    next, in UTC, worked out from the Task's dates and the owner's time zone; it is None when it
    won't fire: the Task is Closed, in Trash or in an archived Project, or the time has passed.
    `sent_at` is when it last fired.
    """

    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name="reminders")
    offset = models.DurationField()
    fire_at = models.DateTimeField(null=True, blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        """Model options."""

        ordering = ("offset", "id")
        indexes: ClassVar = [
            models.Index(
                fields=["fire_at"],
                condition=Q(fire_at__isnull=False),
                name="reminder_pending_fire_at_idx",
            ),
        ]
        constraints: ClassVar = [
            models.UniqueConstraint(fields=["task", "offset"], name="tasks_reminder_unique_offset"),
        ]

    @override
    def __str__(self) -> str:
        """Return the offset, which is how the user picked the Reminder."""
        return str(self.offset)


def _attachment_key(attachment: Attachment, _filename: str) -> str:
    """Return a fresh storage key, so a file's name never reaches the file system."""
    return f"attachments/{attachment.task.owner_id}/{uuid.uuid4().hex}"


class Attachment(models.Model):
    """A file uploaded against a Task.

    The original name lives only here; the stored file is named by a generated key. Deleting an
    Attachment is for good: the service removes its file once the deletion commits.
    """

    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name="attachments")
    name = models.CharField(max_length=255)
    size = models.PositiveBigIntegerField()
    content_type = models.CharField(max_length=255)
    file = models.FileField(upload_to=_attachment_key, max_length=255)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        """Model options."""

        ordering = ("created_at", "id")

    @override
    def __str__(self) -> str:
        """Return the file's original name, which is how the user knows it."""
        return self.name


class Comment(models.Model):
    """A markdown note on a Task, which may mention the user's People.

    Comments are a running log rather than history, so changing one isn't recorded in Activity and
    deleting one is for good. `updated_at` differs from `created_at` once the body is edited.
    """

    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name="comments")
    body = models.TextField(max_length=10_000)
    created_at = models.DateTimeField(default=timezone.now)
    # Not `auto_now`: the client shows "edited" when this differs from `created_at`, so a new
    # Comment must get the very same instant, and rewriting a Mention mustn't count as an edit.
    updated_at = models.DateTimeField(default=timezone.now)

    class Meta:
        """Model options."""

        ordering = ("created_at", "id")

    @override
    def __str__(self) -> str:
        """Return the start of the body, which is how the admin lists Comments."""
        return self.body[:50]


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
