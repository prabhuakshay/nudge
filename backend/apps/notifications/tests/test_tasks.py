"""Tests for the notification background jobs."""

from __future__ import annotations

from typing import TYPE_CHECKING

from apps.notifications import services, tasks

if TYPE_CHECKING:
    import pytest


def test_push_notification_pushes_to_devices(monkeypatch: pytest.MonkeyPatch) -> None:
    pushed: list[int] = []
    monkeypatch.setattr(services, "push_to_devices", pushed.append)

    tasks.push_notification(notification_id=7)

    assert pushed == [7]
