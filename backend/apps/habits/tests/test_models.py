"""Tests for the Habit model."""

from __future__ import annotations

from apps.habits.models import Habit


def test_a_habit_reads_as_its_name() -> None:
    assert str(Habit(name="Drink water")) == "Drink water"
