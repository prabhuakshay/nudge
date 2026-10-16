import { makeTask } from "@/test/tasks";

import { coversDay, monthWeeks, shiftMonths, tasksOn } from "./layout";

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
