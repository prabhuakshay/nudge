"""Tests for deleting Trash units for good: Delete forever and Empty Trash."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client

from apps.tasks import attachments, creation, services, trash
from apps.tasks.models import Task

if TYPE_CHECKING:
    from collections.abc import Callable

    from django.test.client import _MonkeyPatchedWSGIResponse as Response
    from pytest_django.fixtures import DjangoCaptureOnCommitCallbacks

    from apps.accounts.models import User


def _trashed(user: User, title: str) -> Task:
    task = creation.create_task(services.inbox(user), title)
    trash.trash_task(user, task.pk)
    return task


def _delete_forever(client: Client, *tasks: Task) -> Response:
    return client.post(
        "/api/v1/trash/delete",
        {"task_ids": [task.pk for task in tasks]},
        content_type="application/json",
    )


def _trash_titles(client: Client) -> list[str]:
    return [row["title"] for row in client.get("/api/v1/trash").json()]


def _exists(task: Task) -> bool:
    return Task.objects.filter(pk=task.pk).exists()


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("method", "path"), [("post", "/api/v1/trash/delete"), ("delete", "/api/v1/trash")]
)
def test_every_delete_forever_endpoint_requires_a_session(method: str, path: str) -> None:
    response = getattr(Client(), method)(path, content_type="application/json")

    assert response.status_code == 401


@pytest.mark.django_db
def test_delete_forever_removes_one_unit(client: Client, ada: User) -> None:
    gone = _trashed(ada, "Pay rent")
    _trashed(ada, "Buy milk")

    response = _delete_forever(client, gone)

    assert response.status_code == 204
    assert _trash_titles(client) == ["Buy milk"]
    assert not _exists(gone)


@pytest.mark.django_db
def test_delete_forever_removes_several_units(client: Client, ada: User) -> None:
    first, second = _trashed(ada, "Pay rent"), _trashed(ada, "Buy milk")

    response = _delete_forever(client, first, second)

    assert response.status_code == 204
    assert _trash_titles(client) == []


@pytest.mark.django_db
def test_delete_forever_takes_the_subtasks_that_went_to_trash_with_it(
    client: Client,
    ada: User,
) -> None:
    task = creation.create_task(services.inbox(ada), "Move house")
    subtask = creation.create_subtask(task, "Pack").task
    trash.trash_task(ada, task.pk)

    _delete_forever(client, task)

    assert not _exists(subtask)


@pytest.mark.django_db
def test_delete_forever_of_a_live_task_is_not_found(client: Client, ada: User) -> None:
    live = creation.create_task(services.inbox(ada), "Pay rent")

    response = _delete_forever(client, live)

    assert response.status_code == 404
    assert _exists(live)


@pytest.mark.django_db
def test_delete_forever_of_another_users_task_is_not_found_and_deletes_nothing(
    client: Client,
    ada: User,
    grace: User,
) -> None:
    mine, theirs = _trashed(ada, "Pay rent"), _trashed(grace, "Buy milk")

    response = _delete_forever(client, mine, theirs)

    assert response.status_code == 404
    assert (_exists(mine), _exists(theirs)) == (True, True)


@pytest.mark.django_db
def test_delete_forever_needs_at_least_one_id(client: Client) -> None:
    response = _delete_forever(client)

    assert response.status_code == 422


@pytest.mark.django_db
def test_delete_forever_deletes_attachment_files_after_commit(
    client: Client,
    ada: User,
    stored_files: Callable[[], list[str]],
    django_capture_on_commit_callbacks: DjangoCaptureOnCommitCallbacks,
) -> None:
    task = creation.create_task(services.inbox(ada), "File the taxes")
    attachments.attach_file(ada, task.pk, SimpleUploadedFile("return.pdf", b"%PDF"))
    trash.trash_task(ada, task.pk)

    with django_capture_on_commit_callbacks(execute=True):
        _delete_forever(client, task)

    assert stored_files() == []


@pytest.mark.django_db
def test_empty_trash_deletes_every_unit_of_the_user_only(
    client: Client,
    ada: User,
    grace: User,
) -> None:
    mine, theirs = _trashed(ada, "Pay rent"), _trashed(grace, "Buy milk")
    live = creation.create_task(services.inbox(ada), "Call mum")

    response = client.delete("/api/v1/trash")

    assert response.status_code == 204
    assert (_exists(mine), _exists(theirs), _exists(live)) == (False, True, True)


@pytest.mark.django_db
def test_a_subtask_whose_parent_was_deleted_forever_restores_as_the_last_root(
    client: Client,
    ada: User,
) -> None:
    inbox = services.inbox(ada)
    parent = creation.create_task(inbox, "Move house")
    subtask = creation.create_subtask(parent, "Pack").task
    creation.create_task(inbox, "Buy milk")
    trash.trash_task(ada, subtask.pk)
    trash.trash_task(ada, parent.pk)
    assert _delete_forever(client, parent).status_code == 204

    response = client.post(f"/api/v1/tasks/{subtask.pk}/restore")

    assert response.status_code == 200
    assert response.json()["task"]["parent_id"] is None
    items = client.get(f"/api/v1/tasks?project={inbox.pk}").json()["items"]
    assert [item["title"] for item in items] == ["Buy milk", "Pack"]
