import { habit } from "@/test/habits";

import { lastSevenDays } from "./recent-days";

/** Thursday 15 October 2026 on the user's clock. */
const TODAY = "2026-10-15";

describe("lastSevenDays", () => {
  it("lists the week up to today, oldest first", () => {
    const days = lastSevenDays(habit({ start_date: "2026-01-01" }), TODAY, []);

    expect(days.map((day) => day.date)).toEqual([
      "2026-10-09",
      "2026-10-10",
      "2026-10-11",
      "2026-10-12",
      "2026-10-13",
      "2026-10-14",
      "2026-10-15",
    ]);
  });

  it("marks each day done, partly done or not done against the Goal", () => {
    const days = lastSevenDays(
      habit({ goal: 2, start_date: "2026-01-01", today_count: 1 }),
      TODAY,
      [
        { date: "2026-10-12", count: 2 },
        { date: "2026-10-13", count: 1 },
      ],
    );

    expect(days.map((day) => day.state)).toEqual([
      "none",
      "none",
      "none",
      "done",
      "partial",
      "none",
      "partial",
    ]);
  });

  it("takes today's count from the Habit, which changes as soon as the user checks in", () => {
    const days = lastSevenDays(habit({ start_date: "2026-01-01", today_count: 1 }), TODAY, [
      { date: TODAY, count: 0 },
    ]);

    expect(days.at(-1)?.state).toBe("done");
  });

  it("marks the days a weekday Habit isn't asked for as unscheduled", () => {
    const monWedFri = habit({
      frequency: "weekdays",
      weekdays: [1, 3, 5],
      start_date: "2026-01-01",
    });

    const days = lastSevenDays(monWedFri, TODAY, []);

    // Fri 9 to Thu 15 October.
    expect(days.map((day) => day.state)).toEqual([
      "none",
      "unscheduled",
      "unscheduled",
      "none",
      "unscheduled",
      "none",
      "unscheduled",
    ]);
  });

  it("marks the days before the start date as unscheduled", () => {
    const days = lastSevenDays(habit({ start_date: "2026-10-14" }), TODAY, []);

    expect(days.map((day) => day.state)).toEqual([
      "unscheduled",
      "unscheduled",
      "unscheduled",
      "unscheduled",
      "unscheduled",
      "none",
      "none",
    ]);
  });

  it("asks a times-a-week Habit for every day", () => {
    const twice = habit({
      frequency: "times_per_week",
      times_per_week: 2,
      start_date: "2026-01-01",
    });

    const days = lastSevenDays(twice, TODAY, []);

    expect(days.every((day) => day.state === "none")).toBe(true);
  });
});
