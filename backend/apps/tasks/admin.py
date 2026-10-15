"""Django admin registration for Folders, Projects, Tags, Tasks, their Activity and People."""

from __future__ import annotations

from typing import TYPE_CHECKING, override

from django.contrib import admin

from apps.tasks.models import Folder, Person, Project, Tag, Task, TaskActivity

if TYPE_CHECKING:
    from django.http import HttpRequest


@admin.register(Folder)
class FolderAdmin(admin.ModelAdmin[Folder]):
    """Folders, for checking how a user has grouped their Projects."""

    list_display = ("name", "owner", "collapsed", "created_at")
    search_fields = ("name", "owner__email")
    raw_id_fields = ("owner",)


@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin[Project]):
    """Projects, for checking what a user has set up."""

    list_display = (
        "name",
        "owner",
        "folder",
        "is_inbox",
        "archived_at",
        "created_at",
        "deleted_at",
    )
    search_fields = ("name", "owner__email")
    raw_id_fields = ("owner", "folder")


@admin.register(Tag)
class TagAdmin(admin.ModelAdmin[Tag]):
    """Tags, for checking how a user labels their Tasks."""

    list_display = ("name", "owner", "color", "created_at")
    search_fields = ("name", "owner__email")
    raw_id_fields = ("owner",)


@admin.register(Task)
class TaskAdmin(admin.ModelAdmin[Task]):
    """Tasks, for looking into a user's report of a problem."""

    list_display = ("title", "owner", "project", "status", "priority", "created_at")
    list_filter = ("status", "priority")
    search_fields = ("title", "owner__email")
    raw_id_fields = ("owner", "project")


@admin.register(TaskActivity)
class TaskActivityAdmin(admin.ModelAdmin[TaskActivity]):
    """Task histories, read-only, for seeing what happened to a Task a user asks about.

    The history is the record of what happened, so nobody edits it here.
    """

    list_display = ("task", "kind", "at")
    list_filter = ("kind",)
    list_select_related = ("task",)
    search_fields = ("task__title", "task__owner__email")
    raw_id_fields = ("task",)

    @override
    def has_add_permission(self, request: HttpRequest) -> bool:
        """Refuse new events: only the app records what happened."""
        return False

    @override
    def has_change_permission(
        self,
        request: HttpRequest,
        obj: TaskActivity | None = None,
    ) -> bool:
        """Refuse edits: the history stays as it was recorded."""
        return False

    @override
    def has_delete_permission(
        self,
        request: HttpRequest,
        obj: TaskActivity | None = None,
    ) -> bool:
        """Refuse deletes: events go only with their Task."""
        return False


@admin.register(Person)
class PersonAdmin(admin.ModelAdmin[Person]):
    """People, for checking a user's address book."""

    list_display = ("name", "owner", "color", "created_at")
    search_fields = ("name", "owner__email")
    raw_id_fields = ("owner",)
