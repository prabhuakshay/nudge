"""Django admin registration for Folders, Projects and Tasks."""

from __future__ import annotations

from django.contrib import admin

from apps.tasks.models import Folder, Project, Task


@admin.register(Folder)
class FolderAdmin(admin.ModelAdmin[Folder]):
    """Folders, for checking how a user has grouped their Projects."""

    list_display = ("name", "owner", "collapsed", "created_at")
    search_fields = ("name", "owner__email")
    raw_id_fields = ("owner",)


@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin[Project]):
    """Projects, for checking what a user has set up."""

    list_display = ("name", "owner", "folder", "is_inbox", "created_at", "deleted_at")
    search_fields = ("name", "owner__email")
    raw_id_fields = ("owner", "folder")


@admin.register(Task)
class TaskAdmin(admin.ModelAdmin[Task]):
    """Tasks, for looking into a user's report of a problem."""

    list_display = ("title", "owner", "project", "status", "priority", "created_at")
    list_filter = ("status", "priority")
    search_fields = ("title", "owner__email")
    raw_id_fields = ("owner", "project")
