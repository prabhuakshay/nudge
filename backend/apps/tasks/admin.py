"""Django admin registration for Projects and Tasks."""

from __future__ import annotations

from django.contrib import admin

from apps.tasks.models import Project, Task


@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin[Project]):
    """Projects, for checking what a user has set up."""

    list_display = ("name", "owner", "is_inbox", "created_at", "deleted_at")
    search_fields = ("name", "owner__email")
    raw_id_fields = ("owner",)


@admin.register(Task)
class TaskAdmin(admin.ModelAdmin[Task]):
    """Tasks, for looking into a user's report of a problem."""

    list_display = ("title", "owner", "project", "status", "priority", "created_at")
    list_filter = ("status", "priority")
    search_fields = ("title", "owner__email")
    raw_id_fields = ("owner", "project")
