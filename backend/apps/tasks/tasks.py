"""Background jobs for Tasks, run by the Procrastinate worker."""

from __future__ import annotations

from procrastinate.contrib.django import app

from apps.tasks import purge, reminders


# The lock stops sweeps queueing up behind one that is slow, say after an outage.
@app.periodic(cron="* * * * *")
@app.task(name="tasks.send_due_reminders", queueing_lock="tasks.send_due_reminders")
def send_due_reminders(timestamp: int) -> None:  # noqa: ARG001 - Procrastinate passes the minute
    """Fire the Reminders that are due. The worker defers this every minute."""
    reminders.send_due_reminders()


# 03:00 UTC keeps the purge away from the hours most people use the app.
@app.periodic(cron="0 3 * * *")
@app.task(name="tasks.purge_expired_trash", queueing_lock="tasks.purge_expired_trash")
def purge_expired_trash(timestamp: int) -> None:  # noqa: ARG001 - Procrastinate passes the time
    """Delete the Trash units older than `TRASH_RETENTION_DAYS`. The worker runs it daily."""
    purge.purge_expired_trash()
