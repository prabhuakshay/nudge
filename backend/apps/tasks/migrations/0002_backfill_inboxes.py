"""Give every user created before the tasks app an Inbox; new users get one when created."""

from __future__ import annotations

from typing import TYPE_CHECKING

from django.db import migrations

if TYPE_CHECKING:
    from django.apps.registry import Apps
    from django.db.backends.base.schema import BaseDatabaseSchemaEditor


def create_missing_inboxes(apps: Apps, schema_editor: BaseDatabaseSchemaEditor | None) -> None:
    """Create an Inbox for each user who has none."""
    user_model = apps.get_model("accounts", "User")
    project_model = apps.get_model("tasks", "Project")
    users = user_model.objects.exclude(projects__is_inbox=True)
    project_model.objects.bulk_create(
        project_model(owner=user, name="Inbox", is_inbox=True) for user in users
    )


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0001_initial"),
        ("tasks", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(create_missing_inboxes, migrations.RunPython.noop),
    ]
