import { NO_DATES } from "./due";
import { describeFireTime, fireTime, PRESETS, reminderLabel, remindersLabel } from "./reminders";

describe("reminderLabel", () => {
  it.each([
    [0, "On time"],
    [-5, "5 minutes before"],
    [-30, "30 minutes before"],
    [-60, "1 hour before"],
    [-90, "90 minutes before"],
    [-1440, "1 day before"],
    [-2880, "2 days before"],
    [-10080, "1 week before"],
    [120, "2 hours after"],
  ])("names a timed offset of %i minutes as %s", (offset, label) => {
    expect(reminderLabel(offset, false)).toBe(label);
  });

  it.each([
    [540, "On the day, 09:00"],
    [-900, "1 day before, 09:00"],
    [-2340, "2 days before, 09:00"],
    [-9540, "1 week before, 09:00"],
    [-1410, "1 day before, 00:30"],
    [1980, "1 day after, 09:00"],
  ])("names an all-day offset of %i minutes as %s", (offset, label) => {
    expect(reminderLabel(offset, true)).toBe(label);
  });

  it("has a label for every preset", () => {
    expect(PRESETS.timed.map((offset) => reminderLabel(offset, false))).toEqual([
      "On time",
      "5 minutes before",
      "30 minutes before",
      "1 hour before",
      "1 day before",
    ]);
    expect(PRESETS.allDay.map((offset) => reminderLabel(offset, true))).toEqual([
      "On the day, 09:00",
      "1 day before, 09:00",
      "2 days before, 09:00",
      "1 week before, 09:00",
    ]);
  });
});

describe("remindersLabel", () => {
  it("lists Reminders earliest first", () => {
    expect(remindersLabel([0, -30], false)).toBe("30 minutes before, On time");
  });

  it("says None when there are none", () => {
    expect(remindersLabel([], false)).toBe("None");
  });
});

describe("fireTime", () => {
  it("counts from the due time", () => {
    const dates = { ...NO_DATES, due_date: "2026-11-06", due_time: "14:00:00" };

    expect(fireTime(dates, -30)).toEqual(new Date(2026, 10, 6, 13, 30));
  });

  it("counts from the start of the day for an all-day Task", () => {
    const dates = { ...NO_DATES, due_date: "2026-11-06" };

    expect(fireTime(dates, -900)).toEqual(new Date(2026, 10, 5, 9, 0));
  });

  it("counts from the start of a range", () => {
    const dates = {
      due_date: "2026-11-09",
      due_time: "18:00:00",
      start_date: "2026-11-07",
      start_time: "08:00:00",
    };

    expect(fireTime(dates, -60)).toEqual(new Date(2026, 10, 7, 7, 0));
  });

  it("has nothing to count from without a due date", () => {
    expect(fireTime(NO_DATES, 0)).toBeNull();
  });
});

describe("describeFireTime", () => {
  it("names the day and the time", () => {
    expect(describeFireTime(new Date(2026, 10, 6, 13, 30))).toBe("Fri 6 Nov, 13:30");
  });
});
