"""Tests for the tasks app's background jobs."""

from __future__ import annotations

from typing import TYPE_CHECKING

from procrastinate.contrib.django import app

from apps.habits import reminders as habit_reminders
from apps.tasks import purge, reminders, tasks

if TYPE_CHECKING:
    import pytest


def test_the_reminder_sweep_runs_every_minute() -> None:
    periodic = app.periodic_registry.periodic_tasks[("tasks.send_due_reminders", "")]

    assert periodic.cron == "* * * * *"


def test_the_reminder_sweep_sends_due_task_and_habit_reminders(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sweeps: list[str] = []
    monkeypatch.setattr(reminders, "send_due_reminders", lambda: sweeps.append("tasks"))
    monkeypatch.setattr(habit_reminders, "send_due_reminders", lambda: sweeps.append("habits"))

    tasks.send_due_reminders(timestamp=1_793_000_000)

    assert sweeps == ["tasks", "habits"]


def test_the_trash_purge_runs_daily() -> None:
    periodic = app.periodic_registry.periodic_tasks[("tasks.purge_expired_trash", "")]

    assert periodic.cron == "0 3 * * *"


def test_the_trash_purge_deletes_expired_trash(monkeypatch: pytest.MonkeyPatch) -> None:
    purges: list[str] = []

    def purge_expired_trash() -> int:
        purges.append("purged")
        return 0

    monkeypatch.setattr(purge, "purge_expired_trash", purge_expired_trash)

    tasks.purge_expired_trash(timestamp=1_793_000_000)

    assert purges == ["purged"]
