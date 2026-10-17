"""Habits, the things a user wants to do regularly (see docs/adr/0001-habits-are-not-tasks.md)."""

from __future__ import annotations

from typing import ClassVar, override

from django.conf import settings
from django.db import models
from django.db.models import Q
from django.utils import timezone

from apps.core.palette import PaletteColor

MAX_GOAL = 99


class HabitIcon(models.TextChoices):
    """The Lucide icons a Habit can show. Not `Habit.Icon`: the API schema names enums by class."""

    CIRCLE_CHECK = "circle-check", "Check"
    DROPLET = "droplet", "Water"
    BOOK_OPEN = "book-open", "Book"
    DUMBBELL = "dumbbell", "Dumbbell"
    FOOTPRINTS = "footprints", "Footprints"
    BIKE = "bike", "Bike"
    APPLE = "apple", "Apple"
    SALAD = "salad", "Salad"
    PILL = "pill", "Pill"
    BED = "bed", "Bed"
    MOON = "moon", "Moon"
    SUN = "sun", "Sun"
    BRAIN = "brain", "Brain"
    HEART_PULSE = "heart-pulse", "Heart"
    MUSIC = "music", "Music"
    PENCIL = "pencil", "Pencil"
    LANGUAGES = "languages", "Languages"
    CODE = "code", "Code"
    SPROUT = "sprout", "Sprout"
    COFFEE = "coffee", "Coffee"
    CIGARETTE_OFF = "cigarette-off", "No smoking"
    WALLET = "wallet", "Wallet"
    SMILE = "smile", "Smile"
    STAR = "star", "Star"


class Habit(models.Model):
    """Something the user wants to do regularly, tracked day by day rather than closed.

    A Habit is not a Task: it has no Status or Repeat, and its Frequency is plain fields rather
    than an RRULE. `goal` is how many Check-ins make a day done. `start_date` is the first day
    the Habit counts, in the user's time zone.
    `position` is a fractional-indexing key in the user's manual order.
    """

    class Frequency(models.TextChoices):
        """When a Habit is meant to be done."""

        DAILY = "daily", "Every day"

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="habits",
    )
    name = models.CharField(max_length=100)
    icon = models.CharField(max_length=32, choices=HabitIcon)
    color = models.CharField(max_length=16, choices=PaletteColor)
    frequency = models.CharField(max_length=16, choices=Frequency, default=Frequency.DAILY)
    goal = models.PositiveSmallIntegerField(default=1)
    start_date = models.DateField()
    position = models.CharField(max_length=255, db_collation="C")
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        """Model options."""

        ordering = ("position", "id")
        constraints: ClassVar = [
            models.CheckConstraint(condition=~Q(name=""), name="habits_habit_name_not_empty"),
            models.CheckConstraint(
                condition=Q(goal__gte=1, goal__lte=MAX_GOAL),
                name="habits_habit_goal_in_range",
            ),
        ]

    @override
    def __str__(self) -> str:
        """Return the name, which is how the user tells Habits apart."""
        return self.name


class CheckIn(models.Model):
    """How many times the user did a Habit on one day, in their time zone.

    One row per Habit per day, never more than the Habit's Goal. A day with no Check-ins has no
    row rather than a count of zero.
    """

    habit = models.ForeignKey(Habit, on_delete=models.CASCADE, related_name="check_ins")
    date = models.DateField()
    count = models.PositiveSmallIntegerField()

    class Meta:
        """Model options."""

        ordering = ("date",)
        constraints: ClassVar = [
            models.UniqueConstraint(fields=("habit", "date"), name="habits_checkin_one_per_day"),
            models.CheckConstraint(condition=Q(count__gte=1), name="habits_checkin_count_positive"),
        ]

    @override
    def __str__(self) -> str:
        """Return the Habit, day and count, as the admin and logs show them."""
        return f"{self.habit} on {self.date}: {self.count}"
