"""Tests for the notification center and push subscription endpoints."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from django.test import Client

from apps.notifications import services
from apps.notifications.models import Notification, PushSubscription
from apps.notifications.tests.conftest import PUBLIC_KEY

if TYPE_CHECKING:
    from apps.accounts.models import User

ENDPOINT = "https://push.example.com/send/1"
SUBSCRIPTION = {"endpoint": ENDPOINT, "keys": {"p256dh": "key", "auth": "secret"}}


@pytest.fixture
def client(ada: User) -> Client:
    client = Client()
    client.force_login(ada)
    return client


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("get", "/api/v1/notifications"),
        ("post", "/api/v1/notifications/1/read"),
        ("post", "/api/v1/notifications/read-all"),
        ("delete", "/api/v1/notifications/1"),
        ("post", "/api/v1/notifications/test"),
        ("get", "/api/v1/notifications/push"),
        ("post", "/api/v1/notifications/push/subscriptions"),
        ("delete", "/api/v1/notifications/push/subscriptions"),
    ],
)
def test_every_endpoint_requires_a_session(method: str, path: str) -> None:
    response = getattr(Client(), method)(path)

    assert response.status_code == 401


@pytest.mark.django_db
def test_list_returns_only_the_users_notifications(
    client: Client,
    ada: User,
    grace: User,
) -> None:
    read = services.notify(ada, "Read one")
    services.mark_read(ada, read.pk)
    unread = services.notify(ada, "Pay rent", body="Due today", url="/inbox")
    services.notify(grace, "Grace's")

    response = client.get("/api/v1/notifications")

    assert response.status_code == 200
    body = response.json()
    assert body["unread_count"] == 1
    assert [item["title"] for item in body["items"]] == ["Pay rent", "Read one"]
    assert body["items"][0] == {
        "id": unread.pk,
        "title": "Pay rent",
        "body": "Due today",
        "url": "/inbox",
        "created_at": body["items"][0]["created_at"],
        "read_at": None,
    }


@pytest.mark.django_db
def test_mark_read(client: Client, ada: User) -> None:
    notification = services.notify(ada, "Pay rent")

    response = client.post(f"/api/v1/notifications/{notification.pk}/read")

    assert response.status_code == 204
    assert services.unread_count(ada) == 0


@pytest.mark.django_db
def test_mark_read_cannot_reach_another_users_notification(client: Client, grace: User) -> None:
    notification = services.notify(grace, "Grace's")

    response = client.post(f"/api/v1/notifications/{notification.pk}/read")

    assert response.status_code == 404
    assert services.unread_count(grace) == 1


@pytest.mark.django_db
def test_mark_all_read_leaves_other_users_alone(client: Client, ada: User, grace: User) -> None:
    services.notify(ada, "One")
    services.notify(grace, "Grace's")

    response = client.post("/api/v1/notifications/read-all")

    assert response.status_code == 204
    assert services.unread_count(ada) == 0
    assert services.unread_count(grace) == 1


@pytest.mark.django_db
def test_dismiss(client: Client, ada: User) -> None:
    notification = services.notify(ada, "Pay rent")

    response = client.delete(f"/api/v1/notifications/{notification.pk}")

    assert response.status_code == 204
    assert not Notification.objects.exists()


@pytest.mark.django_db
def test_dismiss_cannot_reach_another_users_notification(client: Client, grace: User) -> None:
    notification = services.notify(grace, "Grace's")

    response = client.delete(f"/api/v1/notifications/{notification.pk}")

    assert response.status_code == 404
    assert Notification.objects.count() == 1


@pytest.mark.django_db
def test_send_test_notification(client: Client, ada: User) -> None:
    response = client.post("/api/v1/notifications/test")

    assert response.status_code == 201
    assert response.json()["title"] == "Test notification"
    assert Notification.objects.get().user == ada


@pytest.mark.django_db
def test_push_config_has_no_key_when_push_is_not_set_up(client: Client) -> None:
    response = client.get("/api/v1/notifications/push")

    assert response.json() == {"public_key": None}


@pytest.mark.django_db
@pytest.mark.usefixtures("push_configured")
def test_push_config_returns_the_public_key(client: Client) -> None:
    response = client.get("/api/v1/notifications/push")

    assert response.json() == {"public_key": PUBLIC_KEY}


@pytest.mark.django_db
def test_subscribe_registers_the_browser(client: Client, ada: User) -> None:
    response = client.post(
        "/api/v1/notifications/push/subscriptions",
        SUBSCRIPTION,
        content_type="application/json",
    )

    assert response.status_code == 204
    assert PushSubscription.objects.get().user == ada


@pytest.mark.django_db
def test_subscribe_rejects_a_non_https_endpoint(client: Client) -> None:
    response = client.post(
        "/api/v1/notifications/push/subscriptions",
        {**SUBSCRIPTION, "endpoint": "http://localhost:8000/admin/"},
        content_type="application/json",
    )

    assert response.status_code == 422
    assert not PushSubscription.objects.exists()


@pytest.mark.django_db
def test_unsubscribe_removes_the_browser(client: Client, ada: User) -> None:
    services.save_push_subscription(ada, ENDPOINT, p256dh="key", auth="secret")

    response = client.delete(
        "/api/v1/notifications/push/subscriptions",
        {"endpoint": ENDPOINT},
        content_type="application/json",
    )

    assert response.status_code == 204
    assert not PushSubscription.objects.exists()


@pytest.mark.django_db
def test_unsubscribe_cannot_remove_another_users_browser(client: Client, grace: User) -> None:
    services.save_push_subscription(grace, ENDPOINT, p256dh="key", auth="secret")

    response = client.delete(
        "/api/v1/notifications/push/subscriptions",
        {"endpoint": ENDPOINT},
        content_type="application/json",
    )

    assert response.status_code == 204
    assert PushSubscription.objects.get().user == grace
