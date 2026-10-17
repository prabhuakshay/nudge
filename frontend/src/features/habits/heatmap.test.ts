import { habit } from "@/test/habits";

import { cellShade, heatmapWeeks } from "./heatmap";

/** Thursday 15 October 2026 on the user's clock. */
const TODAY = "2026-10-15";

describe("cellShade", () => {
  it.each([
    [0, 0],
    [1, 1],
    [3, 2],
    [4, 2],
    [5, 2],
    [6, 3],
    [7, 3],
    [8, 4],
  ] as const)("shades %i of a Goal of 8 at level %i", (count, level) => {
    const shade = cellShade(
      habit({ goal: 8, start_date: "2026-01-01" }),
      "2026-10-14",
      count,
      TODAY,
    );

    expect(shade.level).toBe(level);
  });

  it("shades a day that met a Goal of 1 in full", () => {
    expect(cellShade(habit({ start_date: "2026-01-01" }), "2026-10-14", 1, TODAY).level).toBe(4);
  });

  it("dims the days a weekday Habit doesn't ask for, but still shows their Check-ins", () => {
    const run = habit({ frequency: "weekdays", weekdays: [1, 3, 5], start_date: "2026-01-01" });

    expect(cellShade(run, "2026-10-14", 0, TODAY)).toEqual({
      level: 0,
      dimmed: false,
      editable: true,
    });
    expect(cellShade(run, "2026-10-13", 0, TODAY)).toEqual({
      level: 0,
      dimmed: true,
      editable: true,
    });
    expect(cellShade(run, "2026-10-13", 1, TODAY)).toEqual({
      level: 4,
      dimmed: true,
      editable: true,
    });
  });

  it("dims the days before the start date and keeps them from being changed", () => {
    expect(cellShade(habit({ start_date: "2026-10-10" }), "2026-10-09", 0, TODAY)).toEqual({
      level: 0,
      dimmed: true,
      editable: false,
    });
  });

  it("lets today be changed but not the days after it", () => {
    const read = habit({ start_date: "2026-01-01" });

    expect(cellShade(read, TODAY, 0, TODAY).editable).toBe(true);
    expect(cellShade(read, "2026-10-16", 0, TODAY)).toEqual({
      level: 0,
      dimmed: false,
      editable: false,
    });
  });
});

describe("heatmapWeeks", () => {
  it("covers the last 12 months in Monday-to-Sunday weeks, ending with this one", () => {
    const weeks = heatmapWeeks(TODAY);

    // 1 November 2025 is a Saturday, so the first week starts on Monday 27 October.
    expect(weeks[0]?.[0]).toBe("2025-10-27");
    expect(weeks.at(-1)).toEqual([
      "2026-10-12",
      "2026-10-13",
      "2026-10-14",
      "2026-10-15",
      "2026-10-16",
      "2026-10-17",
      "2026-10-18",
    ]);
    expect(weeks).toHaveLength(51);
  });

  it("starts on the 1st when the month begins on a Monday", () => {
    // 1 June 2026 is a Monday.
    expect(heatmapWeeks("2027-05-03")[0]?.[0]).toBe("2026-06-01");
  });
});
