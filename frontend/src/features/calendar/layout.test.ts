import { NO_DATES, type Dates } from "@/features/tasks/due";
import { makeTask } from "@/test/tasks";

import {
  coversDay,
  monthWeeks,
  shiftMonths,
  tasksOn,
  timeSpan,
  weekDays,
  dayBlocks,
  allDayTasks,
  clockTime,
} from "./layout";

describe("monthWeeks", () => {
  it("lays out a month in whole weeks from Monday", () => {
    const weeks = monthWeeks("2026-10-15");

    expect(weeks.map((week) => [week[0], week[6]])).toEqual([
      ["2026-09-28", "2026-10-04"],
      ["2026-10-05", "2026-10-11"],
      ["2026-10-12", "2026-10-18"],
      ["2026-10-19", "2026-10-25"],
      ["2026-10-26", "2026-11-01"],
    ]);
  });

  it("starts on the 1st when the month starts on a Monday", () => {
    expect(monthWeeks("2026-06-30")[0]?.[0]).toBe("2026-06-01");
  });

  it("takes six weeks for a month that needs them", () => {
    const weeks = monthWeeks("2026-08-01");

    expect(weeks).toHaveLength(6);
    expect(weeks.at(-1)?.at(-1)).toBe("2026-09-06");
  });

  it("takes four weeks for a February that fits them exactly", () => {
    expect(monthWeeks("2027-02-10")).toHaveLength(4);
  });
});

describe("shiftMonths", () => {
  it.each([
    ["2026-10-15", 1, "2026-11-15"],
    ["2026-10-15", -1, "2026-09-15"],
    ["2026-01-31", 1, "2026-02-28"],
    ["2026-12-01", 1, "2027-01-01"],
  ])("moves %s by %i months to %s", (date, months, expected) => {
    expect(shiftMonths(date, months)).toBe(expected);
  });
});

describe("coversDay", () => {
  const range = { due_date: "2026-10-20", due_time: null, start_date: "2026-10-18" };

  it.each([
    ["2026-10-17", false],
    ["2026-10-18", true],
    ["2026-10-19", true],
    ["2026-10-20", true],
    ["2026-10-21", false],
  ])("says whether a range covers %s", (day, expected) => {
    expect(coversDay({ ...range, start_time: null }, day)).toBe(expected);
  });

  it("covers only the due date of a Task without a start", () => {
    const due = {
      due_date: "2026-10-20",
      due_time: "09:00:00",
      start_date: null,
      start_time: null,
    };

    expect([coversDay(due, "2026-10-20"), coversDay(due, "2026-10-19")]).toEqual([true, false]);
  });

  it("covers no day for an undated Task", () => {
    expect(coversDay(makeTask(), "2026-10-20")).toBe(false);
  });
});

describe("tasksOn", () => {
  it("keeps the Tasks on a day in the order given", () => {
    const tasks = [
      makeTask({ id: 1, due_date: "2026-10-20" }),
      makeTask({ id: 2, due_date: "2026-10-21" }),
      makeTask({ id: 3, start_date: "2026-10-19", due_date: "2026-10-21" }),
    ];

    expect(tasksOn(tasks, "2026-10-21").map((task) => task.id)).toEqual([2, 3]);
  });
});

describe("weekDays", () => {
  it("gives the seven days of a date's week, Monday first", () => {
    expect(weekDays("2026-10-15")).toEqual([
      "2026-10-12",
      "2026-10-13",
      "2026-10-14",
      "2026-10-15",
      "2026-10-16",
      "2026-10-17",
      "2026-10-18",
    ]);
  });

  it("puts a Sunday at the end of its week", () => {
    expect(weekDays("2026-11-01")[0]).toBe("2026-10-26");
  });
});

describe("timeSpan", () => {
  const on = (dates: Partial<Dates>): Dates => ({ ...NO_DATES, due_date: "2026-10-15", ...dates });

  it("draws a Task with only a due time as 30 minutes from it", () => {
    expect(timeSpan(on({ due_time: "09:15:00" }))).toEqual({ start: 555, end: 585 });
  });

  it("draws a range on one day from its start time to its due time", () => {
    const range = on({ start_date: "2026-10-15", start_time: "09:00:00", due_time: "10:30:00" });

    expect(timeSpan(range)).toEqual({ start: 540, end: 630 });
  });

  it("draws a range that starts and ends at the same minute as 30 minutes", () => {
    const range = on({ start_date: "2026-10-15", start_time: "09:00:00", due_time: "09:00:00" });

    expect(timeSpan(range)).toEqual({ start: 540, end: 570 });
  });

  it("stops a late block at midnight", () => {
    expect(timeSpan(on({ due_time: "23:45:00" }))).toEqual({ start: 1425, end: 1440 });
  });

  it.each([
    ["a Task without a time", on({})],
    [
      "a range over several days",
      on({ start_date: "2026-10-14", start_time: "09:00:00", due_time: "10:00:00" }),
    ],
    ["an undated Task", NO_DATES],
  ])("puts %s in the all-day strip", (_, dates) => {
    expect(timeSpan(dates)).toBeNull();
  });
});

describe("clockTime", () => {
  it.each([
    [0, "00:00"],
    [555, "09:15"],
    [1439, "23:59"],
  ])("reads %i minutes after midnight as %s", (minutes, expected) => {
    expect(clockTime(minutes)).toBe(expected);
  });
});

describe("dayBlocks", () => {
  const at = (id: number, start: string, end?: string) =>
    makeTask({
      id,
      due_date: "2026-10-15",
      due_time: end ?? start,
      start_date: end === undefined ? null : "2026-10-15",
      start_time: end === undefined ? null : start,
    });
  const placed = (tasks: ReturnType<typeof at>[]) =>
    dayBlocks(tasks, "2026-10-15").map(({ task, column, columns }) => [task.id, column, columns]);

  it("places a day's timed Tasks with their spans, earliest first", () => {
    const blocks = dayBlocks([at(1, "14:00:00"), at(2, "09:00:00", "10:00:00")], "2026-10-15");

    expect(blocks.map(({ task, span }) => [task.id, span])).toEqual([
      [2, { start: 540, end: 600 }],
      [1, { start: 840, end: 870 }],
    ]);
  });

  it("gives blocks that don't overlap the whole width", () => {
    expect(placed([at(1, "09:00:00", "10:00:00"), at(2, "10:00:00", "11:00:00")])).toEqual([
      [1, 0, 1],
      [2, 0, 1],
    ]);
  });

  it("puts overlapping blocks side by side", () => {
    expect(placed([at(1, "09:00:00", "10:00:00"), at(2, "09:30:00")])).toEqual([
      [1, 0, 2],
      [2, 1, 2],
    ]);
  });

  it("reuses a column once its block has ended, sharing the width across the whole overlap", () => {
    const tasks = [
      at(1, "09:00:00", "10:00:00"),
      at(2, "09:30:00", "10:30:00"),
      at(3, "10:00:00", "11:00:00"),
      at(4, "12:00:00"),
    ];

    expect(placed(tasks)).toEqual([
      [1, 0, 2],
      [2, 1, 2],
      [3, 0, 2],
      [4, 0, 1],
    ]);
  });

  it("leaves out all-day Tasks and other days", () => {
    const tasks = [makeTask({ id: 1, due_date: "2026-10-15" }), at(2, "09:00:00")];
    tasks.push(makeTask({ id: 3, due_date: "2026-10-16", due_time: "09:00:00" }));

    expect(placed(tasks)).toEqual([[2, 0, 1]]);
  });
});

describe("allDayTasks", () => {
  it("keeps a day's Tasks without a time and ranges over several days, in the order given", () => {
    const tasks = [
      makeTask({ id: 1, due_date: "2026-10-15", due_time: "09:00:00" }),
      makeTask({ id: 2, due_date: "2026-10-15" }),
      makeTask({
        id: 3,
        start_date: "2026-10-14",
        start_time: "09:00:00",
        due_date: "2026-10-16",
        due_time: "10:00:00",
      }),
      makeTask({ id: 4, due_date: "2026-10-16" }),
    ];

    expect(allDayTasks(tasks, "2026-10-15").map((task) => task.id)).toEqual([2, 3]);
  });
});
