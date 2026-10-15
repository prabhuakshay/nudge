"""Background jobs for Tasks, run by the Procrastinate worker."""

from __future__ import annotations

from procrastinate.contrib.django import app

from apps.tasks import reminders


# The lock stops sweeps queueing up behind one that is slow, say after an outage.
@app.periodic(cron="* * * * *")
@app.task(name="tasks.send_due_reminders", queueing_lock="tasks.send_due_reminders")
def send_due_reminders(timestamp: int) -> None:  # noqa: ARG001 - Procrastinate passes the minute
    """Fire the Reminders that are due. The worker defers this every minute."""
    reminders.send_due_reminders()
