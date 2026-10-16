import { parseQuickAdd, type QuickAddContext } from "./quick-add";

/** Thursday 15 October 2026, 14:30 on the user's clock. */
const NOW = new Date(2026, 9, 15, 14, 30);

const CONTEXT: QuickAddContext = {
  now: NOW,
  projects: [],
  tags: [{ id: 21, name: "may", color: null }],
  people: [],
  dayFirst: false,
};

function parse(text: string, context: Partial<QuickAddContext> = {}) {
  const { title, dates, repeatRule } = parseQuickAdd(text, { ...CONTEXT, ...context });
  return { title, dates, repeatRule };
}

function due(date: string, time: string | null = null) {
  return { due_date: date, due_time: time, start_date: null, start_time: null };
}

describe("parseQuickAdd dates", () => {
  it.each([
    ["Call mom tomorrow 9am", "Call mom", due("2026-10-16", "09:00")],
    ["Pay rent friday", "Pay rent", due("2026-10-16")],
    // Dates resolve forwards, and today counts as ahead.
    ["Gym thursday", "Gym", due("2026-10-15")],
    ["Party 15 oct", "Party", due("2026-10-15")],
    ["Renew passport oct 1", "Renew passport", due("2027-10-01")],
    ["Report due 10/20", "Report due", due("2026-10-20")],
    // A time alone is today while it is still ahead, otherwise tomorrow.
    ["Lunch 4pm", "Lunch", due("2026-10-15", "16:00")],
    ["Standup 9am", "Standup", due("2026-10-16", "09:00")],
    ["Call at noon", "Call", due("2026-10-16", "12:00")],
    // A day that is named keeps its time, even one already past.
    ["Call today 14:00", "Call", due("2026-10-15", "14:00")],
    // "next week" is next Monday.
    ["Review next week", "Review", due("2026-10-19")],
    ["Plan in 3 days", "Plan", due("2026-10-18")],
    ["Dinner next friday at 7pm", "Dinner", due("2026-10-23", "19:00")],
    // The first date wins; later ones stay in the title.
    ["Call tomorrow or friday", "Call or friday", due("2026-10-16")],
    ["May I help", "May I help", null],
    ["Read 2 chapters", "Read 2 chapters", null],
  ])("reads %j", (text, title, dates) => {
    expect(parse(text)).toEqual({ title, dates, repeatRule: null });
  });

  it.each([
    [
      "Trip 3–5 Nov",
      { due_date: "2026-11-05", due_time: null, start_date: "2026-11-03", start_time: null },
    ],
    [
      "Trip 3-5 Nov",
      { due_date: "2026-11-05", due_time: null, start_date: "2026-11-03", start_time: null },
    ],
    [
      "Workshop tomorrow 9-11am",
      { due_date: "2026-10-16", due_time: "11:00", start_date: "2026-10-16", start_time: "09:00" },
    ],
    [
      "Trip mon to wed",
      { due_date: "2026-10-21", due_time: null, start_date: "2026-10-19", start_time: null },
    ],
  ])("reads the range in %j", (text, dates) => {
    expect(parse(text).dates).toEqual(dates);
  });

  it("labels the date chip as the list does", () => {
    const { matches } = parseQuickAdd("Call mom tomorrow 9am", CONTEXT);

    expect(matches).toEqual([
      expect.objectContaining({ kind: "date", start: 9, end: 21, label: "Tomorrow, 09:00" }),
    ]);
  });

  it("leaves a date inside a token alone", () => {
    expect(parse("Plan #may")).toEqual({ title: "Plan", dates: null, repeatRule: null });
  });

  it("takes the next date when the first is kept as text", () => {
    const kept = new Set(["date:tomorrow"]);

    expect(parse("Call tomorrow friday", { kept })).toEqual({
      title: "Call tomorrow",
      dates: due("2026-10-16"),
      repeatRule: null,
    });
  });
});

describe("parseQuickAdd Repeat", () => {
  it.each([
    ["Water every day", "Water", "FREQ=DAILY", due("2026-10-15")],
    ["Water daily", "Water", "FREQ=DAILY", due("2026-10-15")],
    ["Report weekly", "Report", "FREQ=WEEKLY", due("2026-10-15")],
    ["Report every week", "Report", "FREQ=WEEKLY", due("2026-10-15")],
    ["Rent every month", "Rent", "FREQ=MONTHLY", due("2026-10-15")],
    ["Rent monthly", "Rent", "FREQ=MONTHLY", due("2026-10-15")],
    ["Taxes every year", "Taxes", "FREQ=YEARLY", due("2026-10-15")],
    ["Taxes yearly", "Taxes", "FREQ=YEARLY", due("2026-10-15")],
    ["Taxes annually", "Taxes", "FREQ=YEARLY", due("2026-10-15")],
    ["Water every 3 days", "Water", "FREQ=DAILY;INTERVAL=3", due("2026-10-15")],
    ["Sync every 2 weeks", "Sync", "FREQ=WEEKLY;INTERVAL=2", due("2026-10-15")],
    ["Sync every other week", "Sync", "FREQ=WEEKLY;INTERVAL=2", due("2026-10-15")],
    ["Backup every 6 months", "Backup", "FREQ=MONTHLY;INTERVAL=6", due("2026-10-15")],
    ["Walk every weekday", "Walk", "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", due("2026-10-15")],
    // A Repeat without a date starts on its first matching day.
    ["Gym every monday", "Gym", "FREQ=WEEKLY;BYDAY=MO", due("2026-10-19")],
    ["Gym every Mon and Wed", "Gym", "FREQ=WEEKLY;BYDAY=MO,WE", due("2026-10-19")],
    ["Gym every tuesday, thursday", "Gym", "FREQ=WEEKLY;BYDAY=TU,TH", due("2026-10-15")],
    ["Bins every other friday", "Bins", "FREQ=WEEKLY;INTERVAL=2;BYDAY=FR", due("2026-10-16")],
    ["Rent every month on the 1st", "Rent", "FREQ=MONTHLY;BYMONTHDAY=1", due("2026-11-01")],
    ["Rent monthly on the 15th", "Rent", "FREQ=MONTHLY;BYMONTHDAY=15", due("2026-10-15")],
    ["Rent every month on the last day", "Rent", "FREQ=MONTHLY;BYMONTHDAY=-1", due("2026-10-31")],
    // A day of the month, in the many ways people say it.
    ["Rent 15th of every month", "Rent", "FREQ=MONTHLY;BYMONTHDAY=15", due("2026-10-15")],
    ["Rent the 15th of every month", "Rent", "FREQ=MONTHLY;BYMONTHDAY=15", due("2026-10-15")],
    ["Rent on the 15th of every month", "Rent", "FREQ=MONTHLY;BYMONTHDAY=15", due("2026-10-15")],
    ["Rent 15th of each month", "Rent", "FREQ=MONTHLY;BYMONTHDAY=15", due("2026-10-15")],
    ["Rent the 15th of each month", "Rent", "FREQ=MONTHLY;BYMONTHDAY=15", due("2026-10-15")],
    ["Rent every month on 15th", "Rent", "FREQ=MONTHLY;BYMONTHDAY=15", due("2026-10-15")],
    ["Rent monthly on 15th", "Rent", "FREQ=MONTHLY;BYMONTHDAY=15", due("2026-10-15")],
    ["Rent every 15th", "Rent", "FREQ=MONTHLY;BYMONTHDAY=15", due("2026-10-15")],
    ["Rent every 15th of the month", "Rent", "FREQ=MONTHLY;BYMONTHDAY=15", due("2026-10-15")],
    ["Rent 1st of every month", "Rent", "FREQ=MONTHLY;BYMONTHDAY=1", due("2026-11-01")],
    ["Rent last day of every month", "Rent", "FREQ=MONTHLY;BYMONTHDAY=-1", due("2026-10-31")],
    ["Rent the last day of each month", "Rent", "FREQ=MONTHLY;BYMONTHDAY=-1", due("2026-10-31")],
    ["Rent every last day of the month", "Rent", "FREQ=MONTHLY;BYMONTHDAY=-1", due("2026-10-31")],
    ["Review every last friday", "Review", "FREQ=MONTHLY;BYDAY=-1FR", due("2026-10-30")],
    [
      "Review every first monday of the month",
      "Review",
      "FREQ=MONTHLY;BYDAY=1MO",
      due("2026-11-02"),
    ],
    [
      "Birthday every year on oct 15",
      "Birthday",
      "FREQ=YEARLY;BYMONTH=10;BYMONTHDAY=15",
      due("2026-10-15"),
    ],
    [
      "Spring every year on 1 march",
      "Spring",
      "FREQ=YEARLY;BYMONTH=3;BYMONTHDAY=1",
      due("2027-03-01"),
    ],
    [
      "Spring yearly on March 1st",
      "Spring",
      "FREQ=YEARLY;BYMONTH=3;BYMONTHDAY=1",
      due("2027-03-01"),
    ],
    // Until a date, or a number of times.
    [
      "Gym every monday until dec 31",
      "Gym",
      "FREQ=WEEKLY;BYDAY=MO;UNTIL=20261231T235959",
      due("2026-10-19"),
    ],
    ["Pills every day for 5 times", "Pills", "FREQ=DAILY;COUNT=5", due("2026-10-15")],
    ["Pills every day 10 times", "Pills", "FREQ=DAILY;COUNT=10", due("2026-10-15")],
    // A time goes with the first day, which is tomorrow once today's has passed.
    ["Gym every monday 9am", "Gym", "FREQ=WEEKLY;BYDAY=MO", due("2026-10-19", "09:00")],
    ["Standup every day at 9am", "Standup", "FREQ=DAILY", due("2026-10-16", "09:00")],
    ["Standup every day at 5pm", "Standup", "FREQ=DAILY", due("2026-10-15", "17:00")],
    // A date given with the Repeat is the first day.
    ["Gym friday every week", "Gym", "FREQ=WEEKLY", due("2026-10-16")],
  ])("reads %j", (text, title, repeatRule, dates) => {
    expect(parse(text)).toEqual({ title, dates, repeatRule });
  });

  it.each([
    "Read every now and then",
    "Every one of them",
    "Pay every 0 days",
    "Pay every 0th",
    "Pay every 32nd",
  ])("leaves %j alone", (text) => {
    expect(parse(text).repeatRule).toBeNull();
  });

  it("labels the Repeat chip in the user's words", () => {
    const { matches } = parseQuickAdd("Gym every monday", CONTEXT);

    expect(matches).toEqual([
      expect.objectContaining({ kind: "repeat", start: 4, end: 16, label: "Weekly on Monday" }),
    ]);
  });

  it("highlights a day of the month as one Repeat chip", () => {
    const { matches } = parseQuickAdd("Rent 15th of every month", CONTEXT);

    expect(matches).toEqual([
      expect.objectContaining({ kind: "repeat", start: 5, end: 24, label: "Monthly on the 15th" }),
    ]);
  });

  it("keeps a Repeat phrase as text where Tasks can't repeat, and reads no date in it", () => {
    expect(parse("Check every monday", { allowRepeat: false })).toEqual({
      title: "Check every monday",
      dates: null,
      repeatRule: null,
    });
  });

  it("still reads dates where Tasks can't repeat", () => {
    expect(parse("Check tomorrow", { allowRepeat: false }).dates).toEqual(due("2026-10-16"));
  });
});
