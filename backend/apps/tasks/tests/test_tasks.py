"""Tests for the tasks app's background jobs."""

from __future__ import annotations

from typing import TYPE_CHECKING

from procrastinate.contrib.django import app

from apps.tasks import reminders, tasks

if TYPE_CHECKING:
    import pytest


def test_the_reminder_sweep_runs_every_minute() -> None:
    periodic = app.periodic_registry.periodic_tasks[("tasks.send_due_reminders", "")]

    assert periodic.cron == "* * * * *"


def test_the_reminder_sweep_sends_due_reminders(monkeypatch: pytest.MonkeyPatch) -> None:
    sweeps: list[str] = []

    def sweep() -> int:
        sweeps.append("swept")
        return 0

    monkeypatch.setattr(reminders, "send_due_reminders", sweep)

    tasks.send_due_reminders(timestamp=1_793_000_000)

    assert sweeps == ["swept"]
