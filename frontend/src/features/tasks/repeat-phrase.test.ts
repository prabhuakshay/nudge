import { parseQuickAdd, type QuickAddContext } from "./quick-add";

/** Thursday 15 October 2026, 14:30 on the user's clock. */
const NOW = new Date(2026, 9, 15, 14, 30);

const CONTEXT: QuickAddContext = { now: NOW, projects: [], tags: [], people: [], dayFirst: false };

function parse(text: string) {
  const { title, dates, repeatRule, matches } = parseQuickAdd(text, CONTEXT);
  return {
    title,
    repeatRule,
    due: dates && `${dates.due_date} ${dates.due_time ?? ""}`.trim(),
    chips: matches.map((match) => match.text),
  };
}

const WORKWEEK = "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR";

describe("Quick add Repeat phrases", () => {
  it.each([
    ["Gym each monday", "each monday", "FREQ=WEEKLY;BYDAY=MO", "2026-10-19"],
    ["Gym mondays", "mondays", "FREQ=WEEKLY;BYDAY=MO", "2026-10-19"],
    ["Gym on mondays", "on mondays", "FREQ=WEEKLY;BYDAY=MO", "2026-10-19"],
    [
      "Gym mondays and wednesdays",
      "mondays and wednesdays",
      "FREQ=WEEKLY;BYDAY=MO,WE",
      "2026-10-19",
    ],
    [
      "Gym every mon, wed and fri",
      "every mon, wed and fri",
      "FREQ=WEEKLY;BYDAY=MO,WE,FR",
      "2026-10-16",
    ],
    ["Gym every tue & thu", "every tue & thu", "FREQ=WEEKLY;BYDAY=TU,TH", "2026-10-15"],
    ["Clean every weekend", "every weekend", "FREQ=WEEKLY;BYDAY=SA,SU", "2026-10-17"],
    ["Clean weekends", "weekends", "FREQ=WEEKLY;BYDAY=SA,SU", "2026-10-17"],
    ["Clean on weekends", "on weekends", "FREQ=WEEKLY;BYDAY=SA,SU", "2026-10-17"],
    ["Walk weekdays", "weekdays", WORKWEEK, "2026-10-15"],
    ["Walk every workday", "every workday", WORKWEEK, "2026-10-15"],
    ["Walk each business day", "each business day", WORKWEEK, "2026-10-15"],
    ["Water each day", "each day", "FREQ=DAILY", "2026-10-15"],
    ["Pay biweekly", "biweekly", "FREQ=WEEKLY;INTERVAL=2", "2026-10-15"],
    ["Pay bi-weekly", "bi-weekly", "FREQ=WEEKLY;INTERVAL=2", "2026-10-15"],
    ["Pay fortnightly", "fortnightly", "FREQ=WEEKLY;INTERVAL=2", "2026-10-15"],
    ["Pay every fortnight", "every fortnight", "FREQ=WEEKLY;INTERVAL=2", "2026-10-15"],
    ["Taxes quarterly", "quarterly", "FREQ=MONTHLY;INTERVAL=3", "2026-10-15"],
    ["Taxes every quarter", "every quarter", "FREQ=MONTHLY;INTERVAL=3", "2026-10-15"],
    ["Check semiannually", "semiannually", "FREQ=MONTHLY;INTERVAL=6", "2026-10-15"],
    ["Check semi-annually", "semi-annually", "FREQ=MONTHLY;INTERVAL=6", "2026-10-15"],
    ["Check biannually", "biannually", "FREQ=MONTHLY;INTERVAL=6", "2026-10-15"],
    ["Check twice a year", "twice a year", "FREQ=MONTHLY;INTERVAL=6", "2026-10-15"],
    ["Check every 6 months", "every 6 months", "FREQ=MONTHLY;INTERVAL=6", "2026-10-15"],
    ["Taxes every 2 years", "every 2 years", "FREQ=YEARLY;INTERVAL=2", "2026-10-15"],
    [
      "Sync every 2 weeks on tue",
      "every 2 weeks on tue",
      "FREQ=WEEKLY;INTERVAL=2;BYDAY=TU",
      "2026-10-20",
    ],
    [
      "Sync every other week on mon and thu",
      "every other week on mon and thu",
      "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH",
      "2026-10-15",
    ],
    ["Sync weekly on friday", "weekly on friday", "FREQ=WEEKLY;BYDAY=FR", "2026-10-16"],
    [
      "Pay every 3 months on the 1st",
      "every 3 months on the 1st",
      "FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=1",
      "2026-11-01",
    ],
    [
      "Pay quarterly on the 1st",
      "quarterly on the 1st",
      "FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=1",
      "2026-11-01",
    ],
    [
      "Pay every other month on the last day",
      "every other month on the last day",
      "FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=-1",
      "2026-10-31",
    ],
    [
      "Meet every month on the first monday",
      "every month on the first monday",
      "FREQ=MONTHLY;BYDAY=1MO",
      "2026-11-02",
    ],
    ["Meet every 2nd tuesday", "every 2nd tuesday", "FREQ=MONTHLY;BYDAY=2TU", "2026-11-10"],
    ["Pay every 31st", "every 31st", "FREQ=MONTHLY;BYMONTHDAY=31", "2026-10-31"],
    ["Party every jan 1", "every jan 1", "FREQ=YEARLY;BYMONTH=1;BYMONTHDAY=1", "2027-01-01"],
    ["Party every 15 oct", "every 15 oct", "FREQ=YEARLY;BYMONTH=10;BYMONTHDAY=15", "2026-10-15"],
    ["Party every 29 feb", "every 29 feb", "FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29", "2028-02-29"],
    [
      "Party annually on 15 oct",
      "annually on 15 oct",
      "FREQ=YEARLY;BYMONTH=10;BYMONTHDAY=15",
      "2026-10-15",
    ],
    // A part of the day gives the Repeat its time; this morning has passed.
    ["Stretch every morning", "every morning", "FREQ=DAILY", "2026-10-16 09:00"],
    ["Stretch every afternoon", "every afternoon", "FREQ=DAILY", "2026-10-15 15:00"],
    ["Read every evening", "every evening", "FREQ=DAILY", "2026-10-15 18:00"],
    ["Read every night", "every night", "FREQ=DAILY", "2026-10-15 20:00"],
  ])("reads %j", (text, chip, repeatRule, due) => {
    expect(parse(text)).toEqual({
      title: text.slice(0, text.indexOf(chip)).trim(),
      repeatRule,
      due,
      chips: [chip],
    });
  });

  it.each([
    ["Run every morning at 7am", ["every morning", "at 7am"], "FREQ=DAILY", "2026-10-16 07:00"],
    ["Gym 9am every monday", ["9am", "every monday"], "FREQ=WEEKLY;BYDAY=MO", "2026-10-19 09:00"],
    [
      "Meet every thursday at 3",
      ["every thursday", "at 3"],
      "FREQ=WEEKLY;BYDAY=TH",
      "2026-10-15 15:00",
    ],
    ["Lunch every weekday at noon", ["every weekday", "at noon"], WORKWEEK, "2026-10-16 12:00"],
  ])("reads the time with the Repeat in %j", (text, chips, repeatRule, due) => {
    expect(parse(text)).toMatchObject({ repeatRule, due, chips });
  });
});

describe("Quick add Repeat endings", () => {
  it.each([
    ["Gym every monday until dec 31", "FREQ=WEEKLY;BYDAY=MO;UNTIL=20261231T235959"],
    ["Gym every monday till dec 31", "FREQ=WEEKLY;BYDAY=MO;UNTIL=20261231T235959"],
    ["Gym every monday through dec 31", "FREQ=WEEKLY;BYDAY=MO;UNTIL=20261231T235959"],
    ["Gym every monday ending dec 31", "FREQ=WEEKLY;BYDAY=MO;UNTIL=20261231T235959"],
    ["Water every day until eom", "FREQ=DAILY;UNTIL=20261031T235959"],
    // A length of time counts from today, which is its first day.
    ["Gym every monday for 3 weeks", "FREQ=WEEKLY;BYDAY=MO;UNTIL=20261104T235959"],
    ["Gym every friday for 2 months", "FREQ=WEEKLY;BYDAY=FR;UNTIL=20261214T235959"],
    ["Water every day for a week", "FREQ=DAILY;UNTIL=20261021T235959"],
    ["Gym every monday 5 times", "FREQ=WEEKLY;BYDAY=MO;COUNT=5"],
    ["Gym every monday for 5 times", "FREQ=WEEKLY;BYDAY=MO;COUNT=5"],
  ])("reads %j as one chip", (text, repeatRule) => {
    const [title, ...phrase] = text.split(" ");

    expect(parse(text)).toMatchObject({ title, repeatRule, chips: [phrase.join(" ")] });
  });
});

describe("Quick add non-Repeats", () => {
  it.each([
    "Pay every 15",
    "Every one of them",
    "Read every now and then",
    "Pay every 0th",
    "Pay every 32nd",
  ])("leaves %j alone", (text) => {
    expect(parse(text).repeatRule).toBeNull();
  });
});
