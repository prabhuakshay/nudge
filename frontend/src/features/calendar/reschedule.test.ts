import { moveDates, moveToAllDay, moveToTime, resizeEnd, slotMinutes } from "./reschedule";

const ALL_DAY = { start_date: null, start_time: null, due_time: null };

describe("moveDates", () => {
  it("moves a due date to the day it is dropped on and keeps its time", () => {
    const dates = {
      start_date: null,
      start_time: null,
      due_date: "2026-10-15",
      due_time: "09:30:00",
    };

    expect(moveDates(dates, "2026-10-15", "2026-10-20")).toEqual({
      start_date: null,
      start_time: null,
      due_date: "2026-10-20",
      due_time: "09:30:00",
    });
  });

  it("moves a range's start and due together by the days between, so its length stays", () => {
    const dates = {
      start_date: "2026-10-29",
      start_time: "18:00:00",
      due_date: "2026-10-31",
      due_time: null,
    };

    // Dragged by its middle day, Friday 30 October, to Tuesday 3 November.
    expect(moveDates(dates, "2026-10-30", "2026-11-03")).toEqual({
      start_date: "2026-11-02",
      start_time: "18:00:00",
      due_date: "2026-11-04",
      due_time: null,
    });
  });
});

describe("slotMinutes", () => {
  it("snaps a point in an hour slot to the nearest 15 minutes", () => {
    expect(slotMinutes(9, 0)).toBe(9 * 60);
    expect(slotMinutes(9, 0.2)).toBe(9 * 60 + 15);
    expect(slotMinutes(9, 0.6)).toBe(9 * 60 + 30);
    expect(slotMinutes(9, 0.9)).toBe(10 * 60);
  });

  it("reads an edge above or below the slot as a time in the hours beside it", () => {
    // A block grabbed by its middle has its top in the slot above the pointer.
    expect(slotMinutes(10, -0.75)).toBe(9 * 60 + 15);
    expect(slotMinutes(10, 1.5)).toBe(11 * 60 + 30);
  });

  it("keeps the time inside the day", () => {
    expect(slotMinutes(0, -0.5)).toBe(0);
    expect(slotMinutes(23, 1.5)).toBe(24 * 60);
  });
});

describe("moveToTime", () => {
  it("moves a timed Task to the day and time it is dropped on", () => {
    const dates = { ...ALL_DAY, due_date: "2026-10-15", due_time: "09:30:00" };

    expect(moveToTime(dates, "2026-10-15", "2026-10-16", 14 * 60 + 15)).toEqual({
      ...ALL_DAY,
      due_date: "2026-10-16",
      due_time: "14:15:00",
    });
  });

  it("moves a range on one day by its start, so its length stays", () => {
    const dates = {
      start_date: "2026-10-15",
      start_time: "09:00:00",
      due_date: "2026-10-15",
      due_time: "10:30:00",
    };

    expect(moveToTime(dates, "2026-10-15", "2026-10-14", 14 * 60 + 15)).toEqual({
      start_date: "2026-10-14",
      start_time: "14:15:00",
      due_date: "2026-10-14",
      due_time: "15:45:00",
    });
  });

  it("gives an all-day Task the time it is dropped on", () => {
    const dates = { ...ALL_DAY, due_date: "2026-10-15" };

    expect(moveToTime(dates, "2026-10-15", "2026-10-15", 8 * 60 + 45)).toEqual({
      ...ALL_DAY,
      due_date: "2026-10-15",
      due_time: "08:45:00",
    });
  });

  it("keeps a range inside the day it is dropped on", () => {
    const dates = {
      start_date: "2026-10-15",
      start_time: "09:00:00",
      due_date: "2026-10-15",
      due_time: "11:00:00",
    };

    expect(moveToTime(dates, "2026-10-15", "2026-10-15", 23 * 60)).toEqual({
      start_date: "2026-10-15",
      start_time: "21:59:00",
      due_date: "2026-10-15",
      due_time: "23:59:00",
    });
  });

  it("moves a range over several days by days only, since one time can't place both ends", () => {
    const dates = {
      start_date: "2026-10-15",
      start_time: "18:00:00",
      due_date: "2026-10-17",
      due_time: "09:00:00",
    };

    expect(moveToTime(dates, "2026-10-16", "2026-10-19", 10 * 60)).toEqual({
      start_date: "2026-10-18",
      start_time: "18:00:00",
      due_date: "2026-10-20",
      due_time: "09:00:00",
    });
  });
});

describe("moveToAllDay", () => {
  it("takes the time off a timed Task dropped in the all-day strip", () => {
    const dates = {
      start_date: "2026-10-15",
      start_time: "09:00:00",
      due_date: "2026-10-15",
      due_time: "10:30:00",
    };

    expect(moveToAllDay(dates, "2026-10-15", "2026-10-17")).toEqual({
      ...ALL_DAY,
      due_date: "2026-10-17",
    });
  });

  it("moves a Task already in the strip by days, keeping its times", () => {
    const dates = {
      start_date: "2026-10-15",
      start_time: "18:00:00",
      due_date: "2026-10-17",
      due_time: "09:00:00",
    };

    expect(moveToAllDay(dates, "2026-10-15", "2026-10-16")).toEqual({
      start_date: "2026-10-16",
      start_time: "18:00:00",
      due_date: "2026-10-18",
      due_time: "09:00:00",
    });
  });
});

describe("resizeEnd", () => {
  it("sets when a range on one day ends", () => {
    const dates = {
      start_date: "2026-10-15",
      start_time: "09:00:00",
      due_date: "2026-10-15",
      due_time: "10:00:00",
    };

    expect(resizeEnd(dates, 11 * 60 + 15)).toEqual({ ...dates, due_time: "11:15:00" });
  });

  it("gives a Task with no start one at its block's top, so the block stays where it is", () => {
    const dates = { ...ALL_DAY, due_date: "2026-10-15", due_time: "14:00:00" };

    expect(resizeEnd(dates, 15 * 60 + 30)).toEqual({
      start_date: "2026-10-15",
      start_time: "14:00:00",
      due_date: "2026-10-15",
      due_time: "15:30:00",
    });
  });

  it("keeps a block at least 15 minutes long and inside its day", () => {
    const dates = {
      start_date: "2026-10-15",
      start_time: "09:00:00",
      due_date: "2026-10-15",
      due_time: "10:00:00",
    };

    expect(resizeEnd(dates, 8 * 60)).toEqual({ ...dates, due_time: "09:15:00" });
    expect(resizeEnd(dates, 24 * 60)).toEqual({ ...dates, due_time: "23:59:00" });
  });
});
