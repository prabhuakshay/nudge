import { todayIn } from "@/features/tasks/schedule";
import { makeTask as task } from "@/test/tasks";

import { countdownHeadline, countdownLabel, daysLeft, soonestCountdown } from "./countdown";

/** Thursday 15 October 2026 on the user's clock. */
const TODAY = "2026-10-15";

function countdown(overrides: Parameters<typeof task>[0] = {}) {
  return task({ countdown: true, due_date: TODAY, ...overrides });
}

describe("daysLeft", () => {
  it.each([
    ["2026-10-15", 0],
    ["2026-10-16", 1],
    ["2026-10-27", 12],
    ["2027-10-15", 365],
  ])("counts calendar days to %s", (date, days) => {
    expect(daysLeft(countdown({ due_date: date }), TODAY)).toBe(days);
  });

  it("counts a timed Task by its day, so the evening before is still a day away", () => {
    const morning = countdown({ due_date: "2026-10-16", due_time: "09:00:00" });

    expect(daysLeft(morning, todayIn("Europe/London", new Date("2026-10-15T21:30:00Z")))).toBe(1);
  });

  it("counts a timed Task later today as today", () => {
    expect(daysLeft(countdown({ due_time: "23:00:00" }), TODAY)).toBe(0);
  });

  it("counts a range to its start", () => {
    const trip = countdown({ start_date: "2026-10-20", due_date: "2026-10-30" });

    expect(daysLeft(trip, TODAY)).toBe(5);
  });

  it("counts a repeating Task to its current Occurrence", () => {
    const birthday = countdown({ due_date: "2027-03-02", repeat_rule: "FREQ=YEARLY" });

    expect(daysLeft(birthday, TODAY)).toBe(138);
  });

  it.each([
    ["isn't a Countdown", task({ due_date: "2026-10-20" })],
    ["is undated", task({ countdown: true })],
    ["is Closed", countdown({ status: "completed", completed_at: "2026-10-15T08:00:00Z" })],
    ["is Won't do", countdown({ status: "wont_do", completed_at: "2026-10-15T08:00:00Z" })],
    ["has passed", countdown({ due_date: "2026-10-14", is_overdue: true })],
    ["is Overdue today", countdown({ due_time: "09:00:00", is_overdue: true })],
    [
      "is a range that has started",
      countdown({ start_date: "2026-10-14", due_date: "2026-10-20" }),
    ],
  ])("is null when the Task %s", (_, given) => {
    expect(daysLeft(given, TODAY)).toBeNull();
  });

  it("counts a Blocked Task, which is still open", () => {
    expect(daysLeft(countdown({ status: "blocked", due_date: "2026-10-17" }), TODAY)).toBe(2);
  });

  it("goes by the user's clock when their zone is ahead of UTC", () => {
    // 23:30 UTC on 15 October is already 16 October in Auckland.
    const today = todayIn("Pacific/Auckland", new Date("2026-10-15T23:30:00Z"));

    expect(daysLeft(countdown({ due_date: "2026-10-17" }), today)).toBe(1);
  });

  it("goes by the user's clock when their zone is behind UTC", () => {
    // 00:30 UTC on 16 October is still 15 October in New York.
    const today = todayIn("America/New_York", new Date("2026-10-16T00:30:00Z"));

    expect(daysLeft(countdown({ due_date: "2026-10-16" }), today)).toBe(1);
  });
});

describe("countdownLabel", () => {
  it.each([
    [0, "Today"],
    [1, "Tomorrow"],
    [2, "2 days left"],
    [12, "12 days left"],
  ])("says %i days as %s", (days, label) => {
    expect(countdownLabel(days)).toBe(label);
  });
});

describe("countdownHeadline", () => {
  it.each([
    [1, "Exam tomorrow"],
    [12, "Exam in 12 days"],
  ])("names the Task and %i days", (days, headline) => {
    expect(countdownHeadline("Exam", days)).toBe(headline);
  });
});

describe("soonestCountdown", () => {
  it("picks the open Countdown with the soonest date after today", () => {
    const tasks = [
      countdown({ id: 1, title: "Trip", due_date: "2026-11-20" }),
      task({ id: 2, title: "Dentist", due_date: "2026-10-16" }),
      countdown({ id: 3, title: "Exam", due_date: "2026-10-27" }),
    ];

    expect(soonestCountdown(tasks, TODAY)).toMatchObject({ task: { title: "Exam" }, days: 12 });
  });

  it("skips a Countdown that is today", () => {
    const tasks = [
      countdown({ id: 1, title: "Party" }),
      countdown({ id: 2, title: "Exam", due_date: "2026-10-27" }),
    ];

    expect(soonestCountdown(tasks, TODAY)?.task.title).toBe("Exam");
  });

  it("breaks a tie by the list's order", () => {
    const tasks = [
      countdown({ id: 1, title: "Exam", due_date: "2026-10-27" }),
      countdown({ id: 2, title: "Trip", due_date: "2026-10-27" }),
    ];

    expect(soonestCountdown(tasks, TODAY)?.task.title).toBe("Exam");
  });

  it("is undefined without a Countdown to come", () => {
    expect(soonestCountdown([task({ due_date: "2026-10-20" })], TODAY)).toBeUndefined();
  });
});
