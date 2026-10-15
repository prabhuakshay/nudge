/*
 * Quick add's Repeat grammar: English phrases such as "every other week", "mondays", "quarterly",
 * "the 15th of every month" or "every year on oct 15", optionally followed by an ending such as
 * "until <date>", "for 3 weeks" or "5 times", read as RRULEs. chrono-node reads dates well but
 * not repeats, so repeats get a grammar of their own.
 */

import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  format,
  getDaysInMonth,
  isLastDayOfMonth,
} from "date-fns";

import { PART_OF_DAY, quickAddChrono } from "./quick-add-chrono";
import { ruleParts, type Parts } from "./repeat";

/** A Repeat phrase, where it sits in the text, the RRULE it means and the time it implies. */
export type FoundRepeat = { start: number; end: number; text: string; rule: string; time?: string };

const EVERY = "(?:every|each)";
const DAY =
  "(?:mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)";
const PLURAL_DAY = "(?:mon|tues|wednes|thurs|fri|satur|sun)days";
const AND = "(?:\\s*,\\s*(?:and\\s+)?|\\s+(?:and|&)\\s+)";
const MONTH =
  "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const NTH = "(?:first|second|third|fourth|last|1st|2nd|3rd|4th)";
const ORDINAL = "(?:st|nd|rd|th)";
const MONTH_DAY = `(?:(?<day>\\d{1,2})${ORDINAL}?|(?<last>last\\s+day))`;
const DATE = `(?:(?<month>${MONTH})\\s+(?<day>\\d{1,2})${ORDINAL}?|(?<day2>\\d{1,2})${ORDINAL}?\\s+(?:of\\s+)?(?<month2>${MONTH}))`;
const CADENCE =
  `(?:${EVERY}\\s+(?:(?<n>\\d+)\\s+|(?<other>other)\\s+)?(?<unit>day|week|fortnight|month|quarter|year)s?` +
  "|(?<word>daily|weekly|bi-?weekly|fortnightly|monthly|quarterly|yearly|annually|semi-?annually|bi-?annually|twice\\s+a\\s+year))";

const list = (item: string) => `${item}(?:${AND}${item})*`;

const WEEK = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
/** Each cadence word's frequency and how many of it make one step. */
const CADENCES: Record<string, [string, number]> = {
  day: ["DAILY", 1],
  daily: ["DAILY", 1],
  week: ["WEEKLY", 1],
  weekly: ["WEEKLY", 1],
  biweekly: ["WEEKLY", 2],
  fortnight: ["WEEKLY", 2],
  fortnightly: ["WEEKLY", 2],
  month: ["MONTHLY", 1],
  monthly: ["MONTHLY", 1],
  quarter: ["MONTHLY", 3],
  quarterly: ["MONTHLY", 3],
  semiannually: ["MONTHLY", 6],
  biannually: ["MONTHLY", 6],
  "twice a year": ["MONTHLY", 6],
  year: ["YEARLY", 1],
  yearly: ["YEARLY", 1],
  annually: ["YEARLY", 1],
};
const NTH_NUMBER: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, last: -1 };

type Groups = Partial<Record<string, string>>;
type Cadence = { freq: string; interval: number };

/** A weekday's RRULE code, which is its first two letters: "thurs" is TH. */
const dayCode = (word: string) => word.slice(0, 2).toUpperCase();
const monthNumber = (word: string) => MONTHS.indexOf(word.slice(0, 3).toLowerCase()) + 1;

function cadence({ n, other, unit, word }: Groups): Cadence | null {
  const name = (unit ?? word ?? "").toLowerCase().replace(/-/g, "").replace(/\s+/g, " ");
  const [freq, steps] = CADENCES[name] ?? ["DAILY", 1];
  const times = n === undefined ? (other ? 2 : 1) : Number(n);
  return times < 1 ? null : { freq, interval: steps * times };
}

function rule({ freq, interval }: Cadence, parts = ""): string {
  return `FREQ=${freq}${interval > 1 ? `;INTERVAL=${String(interval)}` : ""}${parts}`;
}

function byDays(days = ""): string {
  const codes = new Set(days.split(new RegExp(AND, "i")).map(dayCode));
  return `;BYDAY=${WEEK.filter((code) => codes.has(code)).join(",")}`;
}

function byMonthDay({ day, last }: Groups): string | null {
  const dayOfMonth = last ? -1 : Number(day);
  return dayOfMonth === 0 || dayOfMonth > 31 ? null : `;BYMONTHDAY=${String(dayOfMonth)}`;
}

function byNthDay({ nth = "", weekday = "" }: Groups): string {
  const n = NTH_NUMBER[nth.toLowerCase()] ?? Number(nth.slice(0, 1));
  return `;BYDAY=${String(n)}${dayCode(weekday)}`;
}

function byDate({ month = "", day = "", month2 = "", day2 = "" }: Groups): string | null {
  const monthOfYear = monthNumber(month || month2);
  const dayOfMonth = Number(day || day2);
  // 2000 was a leap year, so 29 February is allowed.
  if (dayOfMonth < 1 || dayOfMonth > getDaysInMonth(new Date(2000, monthOfYear - 1))) return null;
  return `;BYMONTH=${String(monthOfYear)};BYMONTHDAY=${String(dayOfMonth)}`;
}

type RuleOf = (groups: Groups) => string | null;

/** A rule with a fixed frequency and the parts the phrase names. */
const fixed =
  (freq: string, parts: (groups: Groups) => string | null): RuleOf =>
  (groups) => {
    const { other } = groups;
    const named = parts(groups);
    return named === null ? null : rule({ freq, interval: other ? 2 : 1 }, named);
  };

/** A cadence "on" something, which only means something for the cadence's own frequency. */
const cadenceOn =
  (freq: string, parts: (groups: Groups) => string | null): RuleOf =>
  (groups) => {
    const steps = cadence(groups);
    const named = steps?.freq === freq ? parts(groups) : null;
    return steps && named !== null ? rule(steps, named) : null;
  };

const WORKWEEK = "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR";

/** Each phrase of the grammar and the rule it makes; null when the phrase means nothing. */
const GRAMMAR: [string, RuleOf][] = [
  [
    CADENCE,
    (groups) => {
      const steps = cadence(groups);
      return steps && rule(steps);
    },
  ],
  [`${CADENCE}\\s+on\\s+(?<days>${list(DAY)})`, cadenceOn("WEEKLY", ({ days }) => byDays(days))],
  [`${CADENCE}\\s+on\\s+(?:the\\s+)?${MONTH_DAY}`, cadenceOn("MONTHLY", byMonthDay)],
  [
    `${CADENCE}\\s+on\\s+the\\s+(?<nth>${NTH})\\s+(?<weekday>${DAY})`,
    cadenceOn("MONTHLY", byNthDay),
  ],
  [`${CADENCE}\\s+on\\s+${DATE}`, cadenceOn("YEARLY", byDate)],
  [
    `${EVERY}\\s+(?<other>other\\s+)?(?<days>${list(DAY)})`,
    fixed("WEEKLY", ({ days }) => byDays(days)),
  ],
  [`(?:on\\s+)?(?<days>${list(PLURAL_DAY)})`, fixed("WEEKLY", ({ days }) => byDays(days))],
  [
    `${EVERY}\\s+(?:weekday|workday|business\\s+day)|(?:on\\s+)?(?:weekdays|workdays)`,
    () => WORKWEEK,
  ],
  [`${EVERY}\\s+weekend|(?:on\\s+)?weekends`, () => "FREQ=WEEKLY;BYDAY=SA,SU"],
  [
    `${EVERY}\\s+(?<nth>${NTH})\\s+(?<weekday>${DAY})(?:\\s+of\\s+(?:the|each|every)\\s+month)?`,
    fixed("MONTHLY", byNthDay),
  ],
  [`(?:(?:on\\s+)?the\\s+)?${MONTH_DAY}\\s+of\\s+${EVERY}\\s+month`, fixed("MONTHLY", byMonthDay)],
  // The ordinal is required here, so that "every 15" isn't read as a day of the month.
  [
    `${EVERY}\\s+(?:(?<day>\\d{1,2})${ORDINAL}|(?<last>last\\s+day))(?:\\s+of\\s+the\\s+month)?`,
    fixed("MONTHLY", byMonthDay),
  ],
  [`${EVERY}\\s+${DATE}`, fixed("YEARLY", byDate)],
  // The time comes from the part of the day, as in "every morning".
  [`${EVERY}\\s+(?<part>morning|afternoon|evening|night)`, () => "FREQ=DAILY"],
];

/** A phrase stands alone: after a space or the start, before a space, punctuation or the end. */
const PATTERNS = GRAMMAR.map(
  ([source, ruleOf]) =>
    [new RegExp(`(?<!\\S)(?:${source})(?=$|[\\s,.;!?])`, "gi"), ruleOf] as const,
);
const COUNT = /^\s+(?:for\s+)?(\d+)\s+times?(?=$|[\s,.;!?])/i;
const SPAN = /^\s+for\s+(\d+|an?|one)\s+(day|week|month|year)s?(?=$|[\s,.;!?])/i;
const UNTIL = /^\s+(?:until|till|til|through|thru|up\s+to|ending(?:\s+on)?)\s+/i;
const ADD: Record<string, (date: Date, amount: number) => Date> = {
  day: addDays,
  week: addWeeks,
  month: addMonths,
  year: addYears,
};

type Ending = { part: string; length: number };

/** The whole last day counts, since a Task's time can be any time of day. */
const untilPart = (last: Date) => `;UNTIL=${format(last, "yyyyMMdd")}T235959`;

/** "5 times" or "for 5 times". */
function countEnding(after: string): Ending | null {
  const count = COUNT.exec(after);
  const times = Number(count?.[1]);
  return count && times > 0 ? { part: `;COUNT=${String(times)}`, length: count[0].length } : null;
}

/** "for 3 weeks" or "for a month", counted from today, which is its first day. */
function spanEnding(after: string, today: Date): Ending | null {
  const [text, amount = "", unit = ""] = SPAN.exec(after) ?? [];
  const add = ADD[unit.toLowerCase()];
  const times = /^\d+$/.test(amount) ? Number(amount) : 1;
  if (text === undefined || !add || times < 1) return null;
  return { part: untilPart(addDays(add(today, times), -1)), length: text.length };
}

/** "until <date>", "for 3 weeks" or "5 times" after a phrase, as an RRULE part and its length. */
function ending(after: string, today: Date, dayFirst: boolean): Ending | null {
  return countEnding(after) ?? spanEnding(after, today) ?? untilEnding(after, today, dayFirst);
}

/** "until dec 31", "till friday", "ending eom" and the like. */
function untilEnding(after: string, today: Date, dayFirst: boolean): Ending | null {
  const until = UNTIL.exec(after);
  if (!until) return null;
  const rest = after.slice(until[0].length);
  const date = quickAddChrono(dayFirst).parse(rest, today, { forwardDate: true })[0];
  if (date?.index !== 0) return null;
  return { part: untilPart(date.start.date()), length: until[0].length + date.text.length };
}

/** Every phrase each pattern finds, with its ending, overlapping ones included. */
function allPhrases(text: string, today: Date, dayFirst: boolean): FoundRepeat[] {
  return PATTERNS.flatMap(([pattern, ruleOf]) =>
    [...text.matchAll(pattern)].flatMap((match) => {
      const groups = match.groups ?? {};
      const found = ruleOf(groups);
      if (found === null) return [];
      const start = match.index;
      const phraseEnd = start + match[0].length;
      const tail = ending(text.slice(phraseEnd), today, dayFirst);
      const end = phraseEnd + (tail?.length ?? 0);
      const { part = "" } = groups;
      const time = PART_OF_DAY[part.toLowerCase()];
      const phrase = { start, end, text: text.slice(start, end), rule: found + (tail?.part ?? "") };
      return [time === undefined ? phrase : { ...phrase, time }];
    }),
  );
}

/**
 * Every Repeat phrase in the text, left to right, the longest where two start together. `today`
 * is midnight on the user's clock, for reading "until" dates forwards, and `dayFirst` whether
 * they read 3/11 as 3 November.
 */
export function findRepeats(text: string, today: Date, dayFirst: boolean): FoundRepeat[] {
  const sorted = allPhrases(text, today, dayFirst).sort(
    (a, b) => a.start - b.start || b.end - a.end,
  );
  let reached = 0;
  return sorted.filter((repeat) => {
    if (repeat.start < reached) return false;
    reached = repeat.end;
    return true;
  });
}

/** Whether the day is the BYDAY weekday, such as "MO", "1MO" (first Monday) or "-1FR". */
function onDay(byDay: string, day: Date): boolean {
  const [, nth, code] = /^(-?\d)?([A-Z]{2})$/.exec(byDay) ?? [];
  if (code !== WEEK[(day.getDay() + 6) % 7]) return false;
  if (nth === undefined) return true;
  const n = Number(nth);
  return n > 0 ? Math.ceil(day.getDate() / 7) === n : day.getDate() + 7 > getDaysInMonth(day);
}

function matchesRule(parts: Parts, day: Date): boolean {
  const month = parts.get("BYMONTH");
  if (month !== undefined && day.getMonth() + 1 !== Number(month)) return false;
  const monthDay = parts.get("BYMONTHDAY");
  if (monthDay === "-1") return isLastDayOfMonth(day);
  if (monthDay !== undefined) return day.getDate() === Number(monthDay);
  const byDay = parts.get("BYDAY");
  return byDay === undefined || byDay.split(",").some((code) => onDay(code, day));
}

/** Enough days to reach any rule's first day, even 29 February. */
const LOOKAHEAD = 366 * 8;

/** The first day on or after `from` that the rule falls on. */
export function firstDay(rule: string, from: Date): Date {
  const parts = ruleParts(rule);
  for (let offset = 0; offset < LOOKAHEAD; offset++) {
    const day = addDays(from, offset);
    if (matchesRule(parts, day)) return day;
  }
  return from;
}
