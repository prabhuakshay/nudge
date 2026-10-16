"""Tests for Tags on Tasks: tagging on create and edit, the Tag view and the sidebar's Tags."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from apps.core.palette import PaletteColor
from apps.tasks import creation, projects, services, tags
from apps.tasks.models import Tag, Task, TaskActivity

if TYPE_CHECKING:
    from django.test import Client
    from django.test.client import _MonkeyPatchedWSGIResponse as Response

    from apps.accounts.models import User


def _post(client: Client, path: str, data: object) -> Response:
    return client.post(path, data, content_type="application/json")


def _patch(client: Client, path: str, data: object) -> Response:
    return client.patch(path, data, content_type="application/json")


def _tag_names(body: dict[str, list[dict[str, object]]]) -> list[object]:
    return [tag["name"] for tag in body["tags"]]


def _titles(response: Response) -> list[str]:
    return [item["title"] for item in response.json()["items"]]


@pytest.mark.django_db
def test_create_tags_a_task_by_name_creating_new_tags(client: Client, ada: User) -> None:
    tags.create_tag(ada, "Work", color=PaletteColor.RED)

    response = _post(client, "/api/v1/tasks", {"title": "Report", "tags": ["work", "urgent"]})

    assert response.status_code == 201
    assert response.json()["tags"] == [
        {"id": ada.tags.get(name="Work").pk, "name": "Work", "color": "red"},
        {"id": ada.tags.get(name="urgent").pk, "name": "urgent", "color": None},
    ]
    assert [tag.name for tag in ada.tags.all()] == ["Work", "urgent"]


@pytest.mark.django_db
def test_create_tags_a_task_by_id(client: Client, ada: User) -> None:
    work = tags.create_tag(ada, "work")

    response = _post(client, "/api/v1/tasks", {"title": "Report", "tag_ids": [work.pk]})

    assert _tag_names(response.json()) == ["work"]


@pytest.mark.django_db
def test_create_refuses_a_tag_name_with_a_space(client: Client, ada: User) -> None:
    response = _post(client, "/api/v1/tasks", {"title": "Report", "tags": ["two words"]})

    assert response.status_code == 422
    assert not ada.tasks.exists()


@pytest.mark.django_db
def test_create_cannot_use_another_users_tag(client: Client, ada: User, grace: User) -> None:
    graces = tags.create_tag(grace, "hers")

    response = _post(
        client,
        "/api/v1/tasks",
        {"title": "Report", "tags": ["new"], "tag_ids": [graces.pk]},
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Tag not found."}
    assert not ada.tasks.exists()
    assert not ada.tags.exists()


@pytest.mark.django_db
def test_patch_replaces_the_tags_and_logs_each_change(client: Client, ada: User) -> None:
    work, home, urgent = (tags.create_tag(ada, name) for name in ("work", "home", "urgent"))
    task = creation.create_task(services.inbox(ada), "Report", creation.NewTask(tags=[work, home]))

    response = _patch(client, f"/api/v1/tasks/{task.pk}", {"tag_ids": [urgent.pk, work.pk]})

    assert response.status_code == 200
    assert _tag_names(response.json()["task"]) == ["work", "urgent"]
    events = TaskActivity.objects.filter(task=task).exclude(kind=TaskActivity.Kind.CREATED)
    assert sorted((event.kind, event.data["name"]) for event in events) == [
        ("tag_added", "urgent"),
        ("tag_removed", "home"),
    ]


@pytest.mark.django_db
def test_patch_cannot_use_another_users_tag(client: Client, ada: User, grace: User) -> None:
    task = creation.create_task(services.inbox(ada), "Report")
    graces = tags.create_tag(grace, "hers")

    response = _patch(client, f"/api/v1/tasks/{task.pk}", {"tag_ids": [graces.pk]})

    assert response.status_code == 404
    assert not task.tags.exists()


@pytest.mark.django_db
def test_activity_lists_tag_events(client: Client, ada: User) -> None:
    job, work = tags.create_tag(ada, "job"), tags.create_tag(ada, "work")
    task = creation.create_task(services.inbox(ada), "Report")
    services.update_task(ada, task.pk, services.TaskEdit(tags=[job]))
    tags.merge_tag(ada, job.pk, work.pk)
    tags.delete_tag(ada, work.pk)

    response = client.get(f"/api/v1/tasks/{task.pk}/activity")

    assert [(item["kind"], item["data"]) for item in response.json()["items"]] == [
        ("tag_removed", {"name": "work"}),
        ("tags_merged", {"from_tag": "job", "into_tag": "work"}),
        ("tag_added", {"name": "job"}),
        ("created", {}),
    ]


@pytest.mark.django_db
def test_a_renamed_tag_shows_on_its_tasks(client: Client, ada: User) -> None:
    work = tags.create_tag(ada, "work")
    task = creation.create_task(services.inbox(ada), "Report", creation.NewTask(tags=[work]))
    tags.update_tag(ada, work.pk, name="job")

    response = client.get(f"/api/v1/tasks/{task.pk}")

    assert _tag_names(response.json()) == ["job"]


@pytest.mark.django_db
def test_tag_view_lists_open_tasks_across_projects(client: Client, ada: User) -> None:
    work = tags.create_tag(ada, "work")
    project = projects.create_project(ada, "Office")
    creation.create_task(project, "Report", creation.NewTask(tags=[work]))
    creation.create_task(services.inbox(ada), "Email", creation.NewTask(tags=[work]))
    creation.create_task(services.inbox(ada), "Untagged")
    done = creation.create_task(services.inbox(ada), "Done", creation.NewTask(tags=[work]))
    services.update_task(ada, done.pk, services.TaskEdit(status=Task.Status.COMPLETED))

    open_tasks = client.get(f"/api/v1/tasks?tag={work.pk}")
    closed = client.get(f"/api/v1/tasks?tag={work.pk}&closed=true")

    assert open_tasks.status_code == 200
    assert sorted(_titles(open_tasks)) == ["Email", "Report"]
    assert _titles(closed) == ["Done"]


@pytest.mark.django_db
def test_tag_view_leaves_out_trashed_projects(client: Client, ada: User) -> None:
    work = tags.create_tag(ada, "work")
    project = projects.create_project(ada, "Old")
    creation.create_task(project, "Gone", creation.NewTask(tags=[work]))
    project.deleted_at = project.created_at
    project.save()

    response = client.get(f"/api/v1/tasks?tag={work.pk}")

    assert _titles(response) == []


@pytest.mark.django_db
def test_tag_view_and_its_count_leave_out_archived_projects(client: Client, ada: User) -> None:
    work = tags.create_tag(ada, "work")
    project = projects.create_project(ada, "Old")
    creation.create_task(project, "Shelved", creation.NewTask(tags=[work]))
    projects.archive_project(ada, project.pk)

    listed = client.get(f"/api/v1/tasks?tag={work.pk}")
    sidebar = client.get("/api/v1/sidebar")

    assert _titles(listed) == []
    assert sidebar.json()["tags"][0] | {"id": 0} == {
        "id": 0,
        "name": "work",
        "color": None,
        "open_count": 0,
        "task_count": 1,
    }


@pytest.mark.django_db
def test_tag_view_lists_a_tagged_subtask_with_its_parents_title(
    client: Client,
    ada: User,
) -> None:
    work = tags.create_tag(ada, "work")
    parent = creation.create_task(services.inbox(ada), "Launch")
    subtask = creation.create_subtask(parent, "Write the post").task
    services.update_task(ada, subtask.pk, services.TaskEdit(tags=[work]))

    response = client.get(f"/api/v1/tasks?tag={work.pk}")

    rows = response.json()["items"]
    assert [(row["title"], row["parent_title"]) for row in rows] == [("Write the post", "Launch")]


@pytest.mark.django_db
def test_tag_view_cannot_reach_another_users_tag(client: Client, grace: User) -> None:
    graces = tags.create_tag(grace, "hers")
    creation.create_task(services.inbox(grace), "Hers", creation.NewTask(tags=[graces]))

    response = client.get(f"/api/v1/tasks?tag={graces.pk}")

    assert response.status_code == 404
    assert response.json() == {"detail": "Tag not found."}


@pytest.mark.django_db
def test_listing_needs_a_project_a_person_a_tag_or_a_view(client: Client) -> None:
    response = client.get("/api/v1/tasks")

    assert response.status_code == 422
    assert response.json() == {"detail": "Give one of project, person, tag or view."}


@pytest.mark.django_db
def test_sidebar_lists_tags_in_order_with_counts(client: Client, ada: User, grace: User) -> None:
    work, home = tags.create_tag(ada, "work", color=PaletteColor.TEAL), tags.create_tag(ada, "home")
    creation.create_task(services.inbox(ada), "Report", creation.NewTask(tags=[work]))
    done = creation.create_task(services.inbox(ada), "Done", creation.NewTask(tags=[work, home]))
    services.update_task(ada, done.pk, services.TaskEdit(status=Task.Status.WONT_DO))
    tags.create_tag(grace, "hers")

    response = client.get("/api/v1/sidebar")

    assert response.json()["tags"] == [
        {"id": work.pk, "name": "work", "color": "teal", "open_count": 1, "task_count": 2},
        {"id": home.pk, "name": "home", "color": None, "open_count": 0, "task_count": 1},
    ]
    assert Tag.objects.count() == 3
