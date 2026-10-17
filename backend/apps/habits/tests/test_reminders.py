"""Tests for Habit Reminders, fired by the every-minute Reminder sweep."""

from __future__ import annotations

import json
from datetime import UTC, date, datetime, time, timedelta
from typing import TYPE_CHECKING

import pytest

from apps.accounts.services import set_time_zone
from apps.core.palette import PaletteColor
from apps.habits import services
from apps.habits.models import CheckIn, Habit, HabitIcon
from apps.notifications import services as notifications
from apps.notifications.models import Notification
from apps.tasks import tasks as jobs

if TYPE_CHECKING:
    from collections.abc import Callable

    from apps.accounts.models import User

# Tuesday 10 March 2026, 08:00 in London (GMT until 29 March).
NOW = datetime(2026, 3, 10, 8, 0, tzinfo=UTC)


@pytest.fixture
def london(ada: User) -> User:
    return set_time_zone(ada, "Europe/London")


def _habit(  # noqa: PLR0913 - one keyword per Habit setting the tests vary
    user: User,
    *,
    reminder_time: time | None = time(9, 0),
    frequency: Habit.Frequency = Habit.Frequency.DAILY,
    weekdays: tuple[int, ...] = (),
    times_per_week: int | None = None,
    goal: int = 1,
    start_date: date = date(2026, 3, 1),
) -> Habit:
    return services.create_habit(
        user,
        "Drink water",
        icon=HabitIcon.DROPLET,
        color=PaletteColor.BLUE,
        frequency=frequency,
        weekdays=weekdays,
        times_per_week=times_per_week,
        goal=goal,
        start_date=start_date,
        reminder_time=reminder_time,
    )


def _sweep_at(freeze_time: Callable[[datetime], None], instant: datetime) -> list[Notification]:
    freeze_time(instant)
    jobs.send_due_reminders(timestamp=0)
    return list(Notification.objects.order_by("id"))


@pytest.mark.django_db
def test_the_minute_sweep_reminds_at_the_habits_time(
    london: User,
    freeze_time: Callable[[datetime], None],
) -> None:
    freeze_time(NOW)
    habit = _habit(london)

    early = _sweep_at(freeze_time, datetime(2026, 3, 10, 8, 59, tzinfo=UTC))
    due = _sweep_at(freeze_time, datetime(2026, 3, 10, 9, 0, 20, tzinfo=UTC))

    assert early == []
    assert [(n.user, n.title, n.url, n.habit) for n in due] == [
        (london, "Drink water", "/habits", habit),
    ]


@pytest.mark.django_db
def test_a_reminder_fires_once_a_day(london: User, freeze_time: Callable[[datetime], None]) -> None:
    freeze_time(NOW)
    _habit(london)

    first = _sweep_at(freeze_time, datetime(2026, 3, 10, 9, 0, tzinfo=UTC))
    repeat = _sweep_at(freeze_time, datetime(2026, 3, 10, 9, 1, tzinfo=UTC))
    next_day = _sweep_at(freeze_time, datetime(2026, 3, 11, 9, 0, tzinfo=UTC))

    assert (len(first), len(repeat), len(next_day)) == (1, 1, 2)


@pytest.mark.django_db
def test_no_reminder_once_the_days_goal_is_met(
    london: User,
    freeze_time: Callable[[datetime], None],
) -> None:
    freeze_time(NOW)
    habit = _habit(london, goal=2)
    services.set_check_ins(london, habit.pk, date(2026, 3, 10), 1)
    services.set_check_ins(london, habit.pk, date(2026, 3, 10), 2)

    met = _sweep_at(freeze_time, datetime(2026, 3, 10, 9, 0, tzinfo=UTC))
    next_day = _sweep_at(freeze_time, datetime(2026, 3, 11, 9, 0, tzinfo=UTC))

    assert (len(met), len(next_day)) == (0, 1)


@pytest.mark.django_db
def test_undoing_a_check_in_brings_todays_reminder_back(
    london: User,
    freeze_time: Callable[[datetime], None],
) -> None:
    freeze_time(NOW)
    habit = _habit(london)
    services.set_check_ins(london, habit.pk, date(2026, 3, 10), 1)
    services.set_check_ins(london, habit.pk, date(2026, 3, 10), 0)

    assert len(_sweep_at(freeze_time, datetime(2026, 3, 10, 9, 0, tzinfo=UTC))) == 1


@pytest.mark.django_db
def test_an_archived_habit_stays_quiet_until_unarchived(
    london: User,
    freeze_time: Callable[[datetime], None],
) -> None:
    freeze_time(NOW)
    habit = _habit(london)
    services.archive_habit(london, habit.pk)

    archived = _sweep_at(freeze_time, datetime(2026, 3, 10, 9, 0, tzinfo=UTC))
    services.unarchive_habit(london, habit.pk)
    unarchived = _sweep_at(freeze_time, datetime(2026, 3, 11, 9, 0, tzinfo=UTC))

    assert (len(archived), len(unarchived)) == (0, 1)


@pytest.mark.django_db
def test_a_weekday_habit_reminds_only_on_its_days(
    london: User,
    freeze_time: Callable[[datetime], None],
) -> None:
    freeze_time(NOW)
    # Monday and Thursday; NOW is a Tuesday.
    _habit(london, frequency=Habit.Frequency.WEEKDAYS, weekdays=(1, 4))

    tuesday = _sweep_at(freeze_time, datetime(2026, 3, 10, 9, 0, tzinfo=UTC))
    wednesday = _sweep_at(freeze_time, datetime(2026, 3, 11, 9, 0, tzinfo=UTC))
    thursday = _sweep_at(freeze_time, datetime(2026, 3, 12, 9, 0, tzinfo=UTC))
    monday = _sweep_at(freeze_time, datetime(2026, 3, 16, 9, 0, tzinfo=UTC))

    assert [len(tuesday), len(wednesday), len(thursday), len(monday)] == [0, 0, 1, 2]


@pytest.mark.django_db
def test_a_times_a_week_habit_stops_reminding_once_the_week_is_met(
    london: User,
    freeze_time: Callable[[datetime], None],
) -> None:
    freeze_time(NOW)
    habit = _habit(london, frequency=Habit.Frequency.TIMES_PER_WEEK, times_per_week=2)
    services.set_check_ins(london, habit.pk, date(2026, 3, 9), 1)

    tuesday = _sweep_at(freeze_time, datetime(2026, 3, 10, 9, 0, tzinfo=UTC))
    services.set_check_ins(london, habit.pk, date(2026, 3, 10), 1)
    wednesday = _sweep_at(freeze_time, datetime(2026, 3, 11, 9, 0, tzinfo=UTC))
    sunday = _sweep_at(freeze_time, datetime(2026, 3, 15, 9, 0, tzinfo=UTC))
    next_monday = _sweep_at(freeze_time, datetime(2026, 3, 16, 9, 0, tzinfo=UTC))

    assert [len(tuesday), len(wednesday), len(sunday), len(next_monday)] == [1, 1, 1, 2]


@pytest.mark.django_db
def test_a_habit_starting_later_reminds_from_its_start_date(
    london: User,
    freeze_time: Callable[[datetime], None],
) -> None:
    freeze_time(NOW)
    _habit(london, start_date=date(2026, 3, 12))

    before = _sweep_at(freeze_time, datetime(2026, 3, 11, 9, 0, tzinfo=UTC))
    start = _sweep_at(freeze_time, datetime(2026, 3, 12, 9, 0, tzinfo=UTC))

    assert (len(before), len(start)) == (0, 1)


@pytest.mark.django_db
def test_a_new_reminder_time_moves_the_reminder(
    london: User,
    freeze_time: Callable[[datetime], None],
) -> None:
    freeze_time(NOW)
    habit = _habit(london)
    services.update_habit(london, habit.pk, reminder_time=time(20, 30))

    morning = _sweep_at(freeze_time, datetime(2026, 3, 10, 9, 0, tzinfo=UTC))
    evening = _sweep_at(freeze_time, datetime(2026, 3, 10, 20, 30, tzinfo=UTC))

    assert (len(morning), len(evening)) == (0, 1)


@pytest.mark.django_db
def test_removing_the_reminder_time_stops_the_reminder(
    london: User,
    freeze_time: Callable[[datetime], None],
) -> None:
    freeze_time(NOW)
    habit = _habit(london)
    services.update_habit(london, habit.pk, remove_reminder=True)

    assert _sweep_at(freeze_time, datetime(2026, 3, 10, 9, 0, tzinfo=UTC)) == []


@pytest.mark.django_db
def test_a_new_frequency_moves_the_reminder(
    london: User,
    freeze_time: Callable[[datetime], None],
) -> None:
    freeze_time(NOW)
    habit = _habit(london)
    # Only Wednesdays from now on.
    services.update_habit(london, habit.pk, frequency=Habit.Frequency.WEEKDAYS, weekdays=[3])

    tuesday = _sweep_at(freeze_time, datetime(2026, 3, 10, 9, 0, tzinfo=UTC))
    wednesday = _sweep_at(freeze_time, datetime(2026, 3, 11, 9, 0, tzinfo=UTC))

    assert (len(tuesday), len(wednesday)) == (0, 1)


@pytest.mark.django_db
def test_a_reminder_keeps_its_clock_time_across_daylight_saving(
    london: User,
    freeze_time: Callable[[datetime], None],
) -> None:
    # Saturday 28 March 2026, the day before London moves to BST (UTC+1).
    freeze_time(datetime(2026, 3, 28, 8, 0, tzinfo=UTC))
    _habit(london)

    gmt = _sweep_at(freeze_time, datetime(2026, 3, 28, 9, 0, tzinfo=UTC))
    before_bst_nine = _sweep_at(freeze_time, datetime(2026, 3, 29, 7, 59, tzinfo=UTC))
    bst_nine = _sweep_at(freeze_time, datetime(2026, 3, 29, 8, 0, tzinfo=UTC))

    assert [len(gmt), len(before_bst_nine), len(bst_nine)] == [1, 1, 2]


@pytest.mark.django_db
def test_a_reminder_follows_the_users_time_zone(
    ada: User,
    freeze_time: Callable[[datetime], None],
) -> None:
    freeze_time(NOW)
    set_time_zone(ada, "Asia/Kolkata")
    _habit(ada)

    # 09:00 in Kolkata (UTC+05:30).
    assert len(_sweep_at(freeze_time, datetime(2026, 3, 11, 3, 30, tzinfo=UTC))) == 1


@pytest.mark.django_db
def test_a_new_time_zone_moves_the_reminder(
    london: User,
    freeze_time: Callable[[datetime], None],
) -> None:
    freeze_time(NOW)
    _habit(london)
    set_time_zone(london, "Asia/Kolkata")

    # 09:00 in Kolkata, hours before 09:00 in London.
    assert len(_sweep_at(freeze_time, datetime(2026, 3, 11, 3, 30, tzinfo=UTC))) == 1


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("late", "fired"),
    [(timedelta(minutes=59), 1), (timedelta(minutes=61), 0)],
)
def test_after_an_outage_only_reminders_less_than_an_hour_late_fire(
    london: User,
    freeze_time: Callable[[datetime], None],
    late: timedelta,
    fired: int,
) -> None:
    freeze_time(NOW)
    _habit(london)

    late_sweep = _sweep_at(freeze_time, datetime(2026, 3, 10, 9, 0, tzinfo=UTC) + late)
    next_day = _sweep_at(freeze_time, datetime(2026, 3, 11, 9, 0, tzinfo=UTC))

    assert (len(late_sweep), len(next_day)) == (fired, fired + 1)


@pytest.mark.django_db
def test_after_days_of_outage_the_reminder_picks_up_from_today(
    london: User,
    freeze_time: Callable[[datetime], None],
) -> None:
    freeze_time(NOW)
    _habit(london)

    after_outage = _sweep_at(freeze_time, datetime(2026, 3, 13, 8, 0, tzinfo=UTC))
    today = _sweep_at(freeze_time, datetime(2026, 3, 13, 9, 0, tzinfo=UTC))

    assert (len(after_outage), len(today)) == (0, 1)


@pytest.mark.django_db
def test_a_met_goal_stays_quiet_even_with_a_stale_reminder_time(
    london: User,
    freeze_time: Callable[[datetime], None],
) -> None:
    freeze_time(NOW)
    habit = _habit(london)
    # A Check-in that skipped the services, so the reminder time wasn't moved on.
    CheckIn.objects.create(habit=habit, date=date(2026, 3, 10), count=1)

    assert _sweep_at(freeze_time, datetime(2026, 3, 10, 9, 0, tzinfo=UTC)) == []


@pytest.mark.django_db
def test_a_habit_reminder_is_pushed_to_devices(
    london: User,
    freeze_time: Callable[[datetime], None],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sent: list[object] = []
    monkeypatch.setattr(
        notifications,
        "webpush",
        lambda **kwargs: sent.append(json.loads(str(kwargs["data"]))),
    )
    notifications.save_push_subscription(london, "https://push.example.com/phone", "key", "auth")
    freeze_time(NOW)
    _habit(london)
    (notification,) = _sweep_at(freeze_time, datetime(2026, 3, 10, 9, 0, tzinfo=UTC))

    notifications.push_to_devices(notification.pk)

    assert sent == [
        {
            "id": notification.pk,
            "title": "Drink water",
            "body": "",
            "url": "/habits",
            "is_reminder": False,
            "is_habit_reminder": True,
        },
    ]
