import { isDayFirst } from "./quick-add-chrono";
import { parseQuickAdd, type QuickAddContext } from "./quick-add";

/** Thursday 15 October 2026, 14:30 on the user's clock. */
const NOW = new Date(2026, 9, 15, 14, 30);

const CONTEXT: QuickAddContext = { now: NOW, projects: [], tags: [], people: [], dayFirst: false };

function parse(text: string, context: Partial<QuickAddContext> = {}) {
  const { title, dates, matches } = parseQuickAdd(text, { ...CONTEXT, ...context });
  return { title, dates, chips: matches.map((match) => match.text) };
}

function due(date: string, time: string | null = null) {
  return { due_date: date, due_time: time, start_date: null, start_time: null };
}

function range(start: string, end: string) {
  const [startDate = "", startTime = null] = start.split(" ");
  const [endDate = "", endTime = null] = end.split(" ");
  return { start_date: startDate, start_time: startTime, due_date: endDate, due_time: endTime };
}

describe("Quick add date shorthand", () => {
  it.each([
    ["Call tod", "tod", due("2026-10-15")],
    ["Call tdy", "tdy", due("2026-10-15")],
    ["Call tmr", "tmr", due("2026-10-16")],
    ["Call tmrw", "tmrw", due("2026-10-16")],
    ["Call tom", "tom", due("2026-10-16")],
    ["Call day after tomorrow", "day after tomorrow", due("2026-10-17")],
    ["Call the day after tomorrow", "the day after tomorrow", due("2026-10-17")],
    ["Call in 3 days", "in 3 days", due("2026-10-18")],
    ["Call in 2 weeks", "in 2 weeks", due("2026-10-29")],
    ["Call in a month", "in a month", due("2026-11-15")],
    // "next week" is next Monday, "next month" the 1st and "next year" 1 January.
    ["Call next week", "next week", due("2026-10-19")],
    ["Call next month", "next month", due("2026-11-01")],
    ["Call next year", "next year", due("2027-01-01")],
    ["Hike this weekend", "this weekend", due("2026-10-17")],
    ["Hike next weekend", "next weekend", due("2026-10-24")],
    // The end of the week is Friday.
    ["Ship end of week", "end of week", due("2026-10-16")],
    ["Ship eow", "eow", due("2026-10-16")],
    ["Ship end of the month", "end of the month", due("2026-10-31")],
    ["Ship eom", "eom", due("2026-10-31")],
    ["Ship end of year", "end of year", due("2026-12-31")],
    ["Ship eoy", "eoy", due("2026-12-31")],
    ["Call thu", "thu", due("2026-10-15")],
    ["Call thurs", "thurs", due("2026-10-15")],
    ["Call next mon", "next mon", due("2026-10-19")],
    ["Call mon next week", "mon next week", due("2026-10-19")],
    ["Gym on sat", "on sat", due("2026-10-17")],
    ["Pay by friday", "by friday", due("2026-10-16")],
    ["Pay in march", "in march", due("2027-03-01")],
    // A day of the month is the next one.
    ["Pay on the 3rd", "on the 3rd", due("2026-11-03")],
    ["Pay the 20th", "the 20th", due("2026-10-20")],
    ["Pay 23rd", "23rd", due("2026-10-23")],
    ["Pay nov 3rd", "nov 3rd", due("2026-11-03")],
    ["Pay 3rd nov", "3rd nov", due("2026-11-03")],
  ])("reads %j", (text, chip, dates) => {
    expect(parse(text)).toEqual({
      title: text.slice(0, text.indexOf(chip)).trim(),
      dates,
      chips: [chip],
    });
  });
});

describe("Quick add times", () => {
  it.each([
    // Parts of the day: morning 09:00, afternoon 15:00, evening 18:00, night 20:00.
    ["Call tomorrow morning", "tomorrow morning", due("2026-10-16", "09:00")],
    ["Call tomorrow afternoon", "tomorrow afternoon", due("2026-10-16", "15:00")],
    ["Call this afternoon", "this afternoon", due("2026-10-15", "15:00")],
    ["Dinner this evening", "this evening", due("2026-10-15", "18:00")],
    ["Dinner tonight", "tonight", due("2026-10-15", "20:00")],
    ["Call this evening at 7", "this evening at 7", due("2026-10-15", "19:00")],
    ["Call nov 3 morning", "nov 3 morning", due("2026-11-03", "09:00")],
    ["Call noon", "noon", due("2026-10-16", "12:00")],
    ["Call midnight", "midnight", due("2026-10-16", "00:00")],
    // An hour from 1 to 6 without am or pm is in the afternoon.
    ["Call at 5", "at 5", due("2026-10-15", "17:00")],
    ["Stand up at 5:30", "at 5:30", due("2026-10-15", "17:30")],
    ["Call at 9", "at 9", due("2026-10-16", "09:00")],
    ["Call at 05:00", "at 05:00", due("2026-10-16", "05:00")],
    ["Call 17:30", "17:30", due("2026-10-15", "17:30")],
    ["Call 5p", "5p", due("2026-10-15", "17:00")],
    ["Call 9:30p", "9:30p", due("2026-10-15", "21:30")],
    ["Call 10a", "10a", due("2026-10-16", "10:00")],
    ["Call half past 5", "half past 5", due("2026-10-15", "17:30")],
    ["Call quarter to 6", "quarter to 6", due("2026-10-15", "17:45")],
    ["Call tomorrow at half past 9", "tomorrow at half past 9", due("2026-10-16", "09:30")],
    ["Go tod 5pm", "tod 5pm", due("2026-10-15", "17:00")],
  ])("reads %j", (text, chip, dates) => {
    expect(parse(text)).toEqual({
      title: text.slice(0, text.indexOf(chip)).trim(),
      dates,
      chips: [chip],
    });
  });
});

describe("Quick add ranges", () => {
  it.each([
    ["Trip 3–5 nov", "3–5 nov", range("2026-11-03", "2026-11-05")],
    ["Trip from mon to fri", "from mon to fri", range("2026-10-19", "2026-10-23")],
    ["Trip mon-fri", "mon-fri", range("2026-10-19", "2026-10-23")],
    ["Meet 3pm-5pm", "3pm-5pm", range("2026-10-15 15:00", "2026-10-15 17:00")],
    ["Work 9 to 5 tomorrow", "9 to 5 tomorrow", range("2026-10-16 09:00", "2026-10-16 17:00")],
    // 9 has passed today, so the whole range is tomorrow.
    ["Work 9 to 5", "9 to 5", range("2026-10-16 09:00", "2026-10-16 17:00")],
    ["Meet tomorrow 2-4pm", "tomorrow 2-4pm", range("2026-10-16 14:00", "2026-10-16 16:00")],
  ])("reads %j", (text, chip, dates) => {
    expect(parse(text)).toEqual({
      title: text.slice(0, text.indexOf(chip)).trim(),
      dates,
      chips: [chip],
    });
  });
});

describe("Quick add slash dates", () => {
  it.each([
    [false, "Pay 3/11", due("2027-03-11")],
    [true, "Pay 3/11", due("2026-11-03")],
    [true, "Pay 3/11/2027", due("2027-11-03")],
    // A day over 12 can only be the day.
    [false, "Pay 25/12", due("2026-12-25")],
    [true, "Pay 12/25", due("2026-12-25")],
    // Day first doesn't change how month names read.
    [true, "Pay dec 31", due("2026-12-31")],
  ])("reads with dayFirst=%j %j", (dayFirst, text, dates) => {
    expect(parse(text, { dayFirst }).dates).toEqual(dates);
  });

  it("knows which locales write the day first", () => {
    expect(isDayFirst("en-GB")).toBe(true);
    expect(isDayFirst("en-US")).toBe(false);
  });
});

describe("Quick add ordinary words", () => {
  it.each([
    "Thank May for help",
    "I sat on the couch",
    "Get a second opinion",
    "March forward",
    "Buy frisbee",
    "Call Tom",
    "Buy tomato",
    "Fix 3rd floor",
    "Fix the 3rd floor light",
    "Wait a second",
    "Lose a day",
    "Read 2 chapters",
    "Sun cream",
    "They wed",
  ])("leaves %j alone", (text) => {
    expect(parse(text)).toEqual({ title: text, dates: null, chips: [] });
  });
});
