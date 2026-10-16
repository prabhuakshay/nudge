import { describeDates, dueLabel, dueTone, NO_DATES, changeDates, type Dates } from "./due";

// Thursday 15 October 2026, mid-morning.
const NOW = new Date(2026, 9, 15, 10, 30);

function dates(overrides: Partial<Dates>): Dates {
  return { ...NO_DATES, ...overrides };
}

describe("dueLabel", () => {
  it.each([
    [dates({ due_date: "2026-10-15" }), "Today"],
    [dates({ due_date: "2026-10-16", due_time: "09:00:00" }), "Tomorrow, 09:00"],
    [dates({ due_date: "2026-10-14" }), "Yesterday"],
    [dates({ due_date: "2026-10-20" }), "Tuesday"],
    [dates({ due_date: "2026-10-10" }), "Last Sat"],
    [dates({ due_date: "2026-11-06" }), "6 Nov"],
    [dates({ due_date: "2027-01-04" }), "4 Jan 2027"],
  ])("names %o as %s", (value, label) => {
    expect(dueLabel(value, NOW)).toBe(label);
  });

  it("shows a range from its start to its due", () => {
    const trip = dates({
      start_date: "2026-11-03",
      start_time: "22:00:00",
      due_date: "2026-11-04",
      due_time: "06:30:00",
    });

    expect(dueLabel(trip, NOW)).toBe("3 Nov, 22:00 – 4 Nov, 06:30");
  });

  it("names the day once for a range within one day", () => {
    const meeting = dates({
      start_date: "2026-10-15",
      start_time: "14:00:00",
      due_date: "2026-10-15",
      due_time: "15:30:00",
    });

    expect(dueLabel(meeting, NOW)).toBe("Today, 14:00 – 15:30");
  });
});

describe("dueTone", () => {
  it.each([
    [dates({ due_date: "2026-10-14" }), true, "overdue"],
    [dates({ due_date: "2026-10-15" }), false, "today"],
    [dates({ due_date: "2026-10-16" }), false, "tomorrow"],
    [dates({ due_date: "2026-10-19" }), false, "week"],
    [dates({ due_date: "2026-11-06" }), false, "later"],
    [dates({ start_date: "2026-10-12", due_date: "2026-10-18" }), false, "today"],
    [dates({ start_date: "2026-10-16", due_date: "2026-10-18" }), false, "tomorrow"],
  ] as const)("colours %o (overdue: %s) as %s", (value, isOverdue, tone) => {
    expect(dueTone({ ...value, is_overdue: isOverdue }, NOW)).toBe(tone);
  });
});

describe("changeDates: due", () => {
  it("keeps the time when the day changes", () => {
    const value = dates({ due_date: "2026-10-15", due_time: "09:00:00" });

    expect(changeDates(value, { due_date: "2026-10-20" })).toEqual(
      dates({ due_date: "2026-10-20", due_time: "09:00:00" }),
    );
  });

  it("drops the start when the due date moves before it", () => {
    const value = dates({ start_date: "2026-10-15", due_date: "2026-10-18" });

    expect(changeDates(value, { due_date: "2026-10-14" })).toEqual(
      dates({ due_date: "2026-10-14" }),
    );
  });

  it("makes a range all-day when the due time goes", () => {
    const value = dates({
      start_date: "2026-10-15",
      start_time: "09:00:00",
      due_date: "2026-10-18",
      due_time: "17:00:00",
    });

    expect(changeDates(value, { due_time: null })).toEqual(
      dates({ start_date: "2026-10-15", due_date: "2026-10-18" }),
    );
  });

  it("gives an all-day range's start the due time when the due gets one", () => {
    const value = dates({ start_date: "2026-10-15", due_date: "2026-10-18" });

    expect(changeDates(value, { due_time: "17:00:00" })).toEqual(
      dates({
        start_date: "2026-10-15",
        start_time: "17:00:00",
        due_date: "2026-10-18",
        due_time: "17:00:00",
      }),
    );
  });

  it("clears every date with the due date", () => {
    const value = dates({ start_date: "2026-10-15", due_date: "2026-10-18" });

    expect(changeDates(value, { due_date: null })).toEqual(NO_DATES);
  });
});

describe("changeDates: start", () => {
  it("drops a start after the due", () => {
    const value = dates({ due_date: "2026-10-18" });

    expect(changeDates(value, { start_date: "2026-10-19" })).toEqual(value);
  });

  it("drops a start time later than the due time on the same day", () => {
    const value = dates({
      start_date: "2026-10-18",
      start_time: "09:00:00",
      due_date: "2026-10-18",
      due_time: "10:00:00",
    });

    expect(changeDates(value, { start_time: "11:00:00" })).toEqual(
      dates({ due_date: "2026-10-18", due_time: "10:00:00" }),
    );
  });
});

describe("describeDates", () => {
  it("writes the full date, time and range", () => {
    const trip = dates({
      start_date: "2026-11-03",
      start_time: "22:00:00",
      due_date: "2026-11-04",
      due_time: "06:30:00",
    });

    expect(describeDates(trip)).toBe("3 Nov 2026, 22:00 – 4 Nov 2026, 06:30");
    expect(describeDates(dates({ due_date: "2026-11-06" }))).toBe("6 Nov 2026");
  });
});
