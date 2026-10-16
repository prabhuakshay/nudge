import { moveDates } from "./reschedule";

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
