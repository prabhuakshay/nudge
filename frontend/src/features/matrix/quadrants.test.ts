import { todayIn } from "@/features/tasks/schedule";
import { makeTask as task } from "@/test/tasks";

import { quadrantOf } from "./quadrants";

/** Thursday 15 October 2026 on the user's clock. */
const TODAY = "2026-10-15";

describe("quadrantOf", () => {
  it.each([
    [1, "urgent-important"],
    [2, "urgent-important"],
    [3, "urgent"],
    [4, "urgent"],
    [0, "urgent"],
  ] as const)("counts P%i as Important or not", (priority, quadrant) => {
    expect(quadrantOf(task({ priority, due_date: TODAY }), TODAY)).toBe(quadrant);
  });

  it("counts a timed Task whose time just passed today as Urgent", () => {
    const passed = task({ priority: 1, due_date: TODAY, due_time: "09:00:00", is_overdue: true });

    expect(quadrantOf(passed, TODAY)).toBe("urgent-important");
  });

  it("counts an Overdue Task as Urgent", () => {
    expect(quadrantOf(task({ due_date: "2026-10-01", is_overdue: true }), TODAY)).toBe("urgent");
  });

  it.each([
    ["2026-10-15", "urgent"],
    ["2026-10-16", "urgent"],
    ["2026-10-17", "neither"],
  ])("counts an all-day Task on %s as Urgent only today or tomorrow", (date, quadrant) => {
    expect(quadrantOf(task({ due_date: date }), TODAY)).toBe(quadrant);
  });

  it("counts a range that has started as Urgent", () => {
    const started = task({ priority: 2, start_date: "2026-10-10", due_date: "2026-10-30" });

    expect(quadrantOf(started, TODAY)).toBe("urgent-important");
  });

  it("goes by a range's start, so one starting tomorrow is Urgent and one after is not", () => {
    const tomorrow = task({ start_date: "2026-10-16", due_date: "2026-10-30" });
    const later = task({ start_date: "2026-10-17", due_date: "2026-10-18" });

    expect(quadrantOf(tomorrow, TODAY)).toBe("urgent");
    expect(quadrantOf(later, TODAY)).toBe("neither");
  });

  it("never counts an undated Task as Urgent", () => {
    expect(quadrantOf(task({ priority: 1 }), TODAY)).toBe("important");
    expect(quadrantOf(task(), TODAY)).toBe("neither");
  });

  it("goes by the user's clock when their zone is ahead of UTC", () => {
    // 23:30 UTC on 15 October is already 16 October in Auckland.
    const today = todayIn("Pacific/Auckland", new Date("2026-10-15T23:30:00Z"));

    expect(quadrantOf(task({ due_date: "2026-10-17" }), today)).toBe("urgent");
    expect(quadrantOf(task({ due_date: "2026-10-18" }), today)).toBe("neither");
  });

  it("goes by the user's clock when their zone is behind UTC", () => {
    // 00:30 UTC on 16 October is still 15 October in New York.
    const today = todayIn("America/New_York", new Date("2026-10-16T00:30:00Z"));

    expect(quadrantOf(task({ due_date: "2026-10-16" }), today)).toBe("urgent");
    expect(quadrantOf(task({ due_date: "2026-10-17" }), today)).toBe("neither");
  });
});
