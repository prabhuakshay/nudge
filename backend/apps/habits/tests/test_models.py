"""Tests for the Habit and Check-in models."""

from __future__ import annotations

from datetime import date

from apps.habits.models import CheckIn, Habit


def test_a_habit_reads_as_its_name() -> None:
    assert str(Habit(name="Drink water")) == "Drink water"


def test_a_check_in_reads_as_its_habit_day_and_count() -> None:
    check_in = CheckIn(habit=Habit(name="Drink water"), date=date(2026, 3, 10), count=3)

    assert str(check_in) == "Drink water on 2026-03-10: 3"
