"""Tests for the Tag endpoints: create, change, order, merge and delete Tags."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from django.test import Client

from apps.core.palette import PaletteColor
from apps.tasks import creation, services, tags
from apps.tasks.models import Tag, TaskActivity

if TYPE_CHECKING:
    from django.test.client import _MonkeyPatchedWSGIResponse as Response

    from apps.accounts.models import User


def _post(client: Client, path: str, data: object) -> Response:
    return client.post(path, data, content_type="application/json")


def _patch(client: Client, path: str, data: object) -> Response:
    return client.patch(path, data, content_type="application/json")


def _order(user: User) -> list[str]:
    return [tag.name for tag in user.tags.all()]


def _tag_names(user: User, task_id: int) -> list[str]:
    return [tag.name for tag in user.tasks.get(pk=task_id).tags.all()]


def _activity(task_id: int, kind: TaskActivity.Kind) -> list[dict[str, object]]:
    return [event.data for event in TaskActivity.objects.filter(task_id=task_id, kind=kind)]


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("post", "/api/v1/tags"),
        ("patch", "/api/v1/tags/1"),
        ("delete", "/api/v1/tags/1"),
        ("post", "/api/v1/tags/1/move"),
        ("post", "/api/v1/tags/1/merge"),
    ],
)
def test_every_endpoint_requires_a_session(method: str, path: str) -> None:
    response = getattr(Client(), method)(path)

    assert response.status_code == 401


@pytest.mark.django_db
def test_create_makes_a_grey_tag_last_in_the_users_order(client: Client, ada: User) -> None:
    tags.create_tag(ada, "home")

    response = _post(client, "/api/v1/tags", {"name": "  work  "})

    assert response.status_code == 201
    body = response.json()
    assert body == {"id": body["id"], "name": "work", "color": None}
    assert _order(ada) == ["home", "work"]


@pytest.mark.django_db
def test_create_keeps_a_chosen_colour(client: Client) -> None:
    response = _post(client, "/api/v1/tags", {"name": "work", "color": "violet"})

    assert response.json()["color"] == "violet"


@pytest.mark.django_db
def test_create_refuses_a_name_the_user_already_has_in_any_case(
    client: Client,
    ada: User,
    grace: User,
) -> None:
    tags.create_tag(ada, "Work")
    tags.create_tag(grace, "home")

    taken = _post(client, "/api/v1/tags", {"name": "work"})
    someone_elses = _post(client, "/api/v1/tags", {"name": "home"})

    assert taken.status_code == 422
    assert taken.json() == {"detail": "You already have a Tag named “work”."}
    assert someone_elses.status_code == 201


@pytest.mark.django_db
@pytest.mark.parametrize("name", ["", "two words", "#work", "a" * 65])
def test_create_refuses_a_name_with_spaces_or_a_hash_or_too_long(client: Client, name: str) -> None:
    response = _post(client, "/api/v1/tags", {"name": name})

    assert response.status_code == 422


@pytest.mark.django_db
def test_update_renames_recolours_and_clears_the_colour(client: Client, ada: User) -> None:
    tag = tags.create_tag(ada, "work", color=PaletteColor.RED)

    renamed = _patch(client, f"/api/v1/tags/{tag.pk}", {"name": "job", "color": "teal"})
    cleared = _patch(client, f"/api/v1/tags/{tag.pk}", {"color": None})

    assert renamed.status_code == 200
    assert renamed.json() == {"id": tag.pk, "name": "job", "color": "teal"}
    assert cleared.json() == {"id": tag.pk, "name": "job", "color": None}


@pytest.mark.django_db
def test_update_refuses_another_tags_name(client: Client, ada: User) -> None:
    tags.create_tag(ada, "home")
    tag = tags.create_tag(ada, "work")

    response = _patch(client, f"/api/v1/tags/{tag.pk}", {"name": "HOME"})

    assert response.status_code == 422
    assert _order(ada) == ["home", "work"]


@pytest.mark.django_db
def test_update_cannot_reach_another_users_tag(client: Client, grace: User) -> None:
    tag = tags.create_tag(grace, "work")

    response = _patch(client, f"/api/v1/tags/{tag.pk}", {"name": "mine"})

    assert response.status_code == 404
    assert grace.tags.get().name == "work"


@pytest.mark.django_db
def test_move_puts_a_tag_after_another_or_first(client: Client, ada: User) -> None:
    a, b, c = (tags.create_tag(ada, name) for name in ("a", "b", "c"))

    after_b = _post(client, f"/api/v1/tags/{a.pk}/move", {"after_id": b.pk})
    first = _post(client, f"/api/v1/tags/{c.pk}/move", {"after_id": None})

    assert (after_b.status_code, first.status_code) == (204, 204)
    assert _order(ada) == ["c", "b", "a"]


@pytest.mark.django_db
def test_move_after_itself_or_a_missing_tag(client: Client, ada: User, grace: User) -> None:
    a = tags.create_tag(ada, "a")
    tags.create_tag(ada, "b")
    graces = tags.create_tag(grace, "g")

    _post(client, f"/api/v1/tags/{a.pk}/move", {"after_id": a.pk})
    assert _order(ada) == ["a", "b"]

    _post(client, f"/api/v1/tags/{a.pk}/move", {"after_id": graces.pk})
    assert _order(ada) == ["b", "a"]


@pytest.mark.django_db
def test_move_cannot_reach_another_users_tag(client: Client, grace: User) -> None:
    tag = tags.create_tag(grace, "work")

    response = _post(client, f"/api/v1/tags/{tag.pk}/move", {})

    assert response.status_code == 404


@pytest.mark.django_db
def test_delete_removes_the_tag_from_every_task_for_good(client: Client, ada: User) -> None:
    work, home = tags.create_tag(ada, "work"), tags.create_tag(ada, "home")
    task = creation.create_task(services.inbox(ada), "Report", creation.NewTask(tags=[work, home]))

    response = client.delete(f"/api/v1/tags/{work.pk}")

    assert response.status_code == 204
    assert not Tag.objects.filter(pk=work.pk).exists()
    assert _tag_names(ada, task.pk) == ["home"]
    assert _activity(task.pk, TaskActivity.Kind.TAG_REMOVED) == [{"name": "work"}]


@pytest.mark.django_db
def test_delete_cannot_reach_another_users_tag(client: Client, grace: User) -> None:
    tag = tags.create_tag(grace, "work")

    response = client.delete(f"/api/v1/tags/{tag.pk}")

    assert response.status_code == 404
    assert grace.tags.exists()


@pytest.mark.django_db
def test_merge_moves_tasks_onto_the_target_and_deletes_the_source(
    client: Client,
    ada: User,
) -> None:
    job, work = tags.create_tag(ada, "job"), tags.create_tag(ada, "work")
    only_job = creation.create_task(services.inbox(ada), "Report", creation.NewTask(tags=[job]))
    both = creation.create_task(services.inbox(ada), "Review", creation.NewTask(tags=[job, work]))

    response = _post(client, f"/api/v1/tags/{job.pk}/merge", {"into_id": work.pk})

    assert response.status_code == 204
    assert _order(ada) == ["work"]
    assert _tag_names(ada, only_job.pk) == ["work"]
    assert _tag_names(ada, both.pk) == ["work"]
    merged = {"from_tag": "job", "into_tag": "work"}
    assert _activity(only_job.pk, TaskActivity.Kind.TAGS_MERGED) == [merged]
    assert _activity(both.pk, TaskActivity.Kind.TAGS_MERGED) == [merged]


@pytest.mark.django_db
def test_merge_into_itself_is_refused(client: Client, ada: User) -> None:
    tag = tags.create_tag(ada, "work")

    response = _post(client, f"/api/v1/tags/{tag.pk}/merge", {"into_id": tag.pk})

    assert response.status_code == 422
    assert ada.tags.exists()


@pytest.mark.django_db
def test_merge_cannot_reach_another_users_tags(client: Client, ada: User, grace: User) -> None:
    mine, graces = tags.create_tag(ada, "mine"), tags.create_tag(grace, "hers")

    from_hers = _post(client, f"/api/v1/tags/{graces.pk}/merge", {"into_id": mine.pk})
    into_hers = _post(client, f"/api/v1/tags/{mine.pk}/merge", {"into_id": graces.pk})

    assert (from_hers.status_code, into_hers.status_code) == (404, 404)
    assert Tag.objects.count() == 2
