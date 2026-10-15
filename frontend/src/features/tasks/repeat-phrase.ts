/*
 * Quick add's Repeat grammar: English phrases such as "every other week", "every last friday" or
 * "every year on oct 15", optionally followed by "until <date>" or "for N times", read as RRULEs.
 * chrono-node reads dates well but not repeats, so repeats get a grammar of their own.
 */

import * as chrono from "chrono-node";
import { addDays, format, getDaysInMonth, isLastDayOfMonth } from "date-fns";

import { ruleParts, type Parts } from "./repeat";

/** A Repeat phrase, where it sits in the text, and the RRULE it means. */
export type FoundRepeat = { start: number; end: number; text: string; rule: string };

const DAY =
  "(?:mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)";
const MONTH =
  "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const NTH = "(?:first|second|third|fourth|last|1st|2nd|3rd|4th)";
const UNIT = "(?:day|week|month|year)";
const ORDINAL = "(?:st|nd|rd|th)?";

const WEEK = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const FREQ: Record<string, string> = {
  day: "DAILY",
  daily: "DAILY",
  week: "WEEKLY",
  weekly: "WEEKLY",
  month: "MONTHLY",
  monthly: "MONTHLY",
  year: "YEARLY",
  yearly: "YEARLY",
  annually: "YEARLY",
};
const NTH_NUMBER: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, last: -1 };

type Groups = Partial<Record<string, string>>;

/** A weekday's RRULE code, which is its first two letters: "thurs" is TH. */
const dayCode = (word: string) => word.slice(0, 2).toUpperCase();
const monthNumber = (word: string) => MONTHS.indexOf(word.slice(0, 3).toLowerCase()) + 1;
const freq = (word = "") => FREQ[word.toLowerCase()] ?? "DAILY";

function every(unit: string | undefined, interval: number): string | null {
  if (interval < 1) return null;
  return interval === 1 ? `FREQ=${freq(unit)}` : `FREQ=${freq(unit)};INTERVAL=${String(interval)}`;
}

function weekdays({ other, days = "" }: Groups): string {
  const codes = new Set(days.split(/\s*,\s*(?:and\s+)?|\s+and\s+/).map(dayCode));
  const byDay = WEEK.filter((code) => codes.has(code)).join(",");
  return `FREQ=WEEKLY;${other ? "INTERVAL=2;" : ""}BYDAY=${byDay}`;
}

function yearly({ month = "", day = "", month2 = "", day2 = "" }: Groups): string | null {
  const monthOfYear = monthNumber(month || month2);
  const dayOfMonth = Number(day || day2);
  // 2000 was a leap year, so 29 February is allowed.
  if (dayOfMonth < 1 || dayOfMonth > getDaysInMonth(new Date(2000, monthOfYear - 1))) return null;
  return `FREQ=YEARLY;BYMONTH=${String(monthOfYear)};BYMONTHDAY=${String(dayOfMonth)}`;
}

/** Each phrase of the grammar and the rule it makes; null when the phrase means nothing. */
const GRAMMAR: [string, (groups: Groups) => string | null][] = [
  [`every\\s+(?<n>\\d+)\\s+(?<unit>${UNIT})s?`, ({ unit, n }) => every(unit, Number(n))],
  [`every\\s+other\\s+(?<unit>${UNIT})`, ({ unit }) => every(unit, 2)],
  [`every\\s+(?<unit>${UNIT})`, ({ unit }) => every(unit, 1)],
  ["(?<unit>daily|weekly|monthly|yearly|annually)", ({ unit }) => every(unit, 1)],
  ["every\\s+weekday", () => "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"],
  [
    `every\\s+(?<other>other\\s+)?(?<days>${DAY}(?:(?:\\s*,\\s*(?:and\\s+)?|\\s+and\\s+)${DAY})*)`,
    weekdays,
  ],
  [
    `(?:every\\s+month|monthly)\\s+on\\s+the\\s+(?:(?<day>\\d{1,2})${ORDINAL}|(?<last>last\\s+day))`,
    ({ day, last }) => {
      const dayOfMonth = last ? -1 : Number(day);
      return dayOfMonth === 0 || dayOfMonth > 31
        ? null
        : `FREQ=MONTHLY;BYMONTHDAY=${String(dayOfMonth)}`;
    },
  ],
  [
    `every\\s+(?<nth>${NTH})\\s+(?<day>${DAY})(?:\\s+of\\s+(?:the|each|every)\\s+month)?`,
    ({ nth = "", day = "" }) => {
      const n = NTH_NUMBER[nth.toLowerCase()] ?? Number(nth.slice(0, 1));
      return `FREQ=MONTHLY;BYDAY=${String(n)}${dayCode(day)}`;
    },
  ],
  [
    `(?:every\\s+year|yearly|annually)\\s+on\\s+(?:(?<month>${MONTH})\\s+(?<day>\\d{1,2})${ORDINAL}|(?<day2>\\d{1,2})${ORDINAL}\\s+(?:of\\s+)?(?<month2>${MONTH}))`,
    yearly,
  ],
];

/** A phrase stands alone: after a space or the start, before a space, punctuation or the end. */
const PATTERNS = GRAMMAR.map(
  ([source, rule]) => [new RegExp(`(?<!\\S)(?:${source})(?=$|[\\s,.;!?])`, "gi"), rule] as const,
);
const COUNT = /^\s+(?:for\s+)?(\d+)\s+times?(?=$|[\s,.;!?])/i;
const UNTIL = /^\s+until\s+/i;

/** The "until <date>" or "for N times" after a phrase, as an RRULE part and its length. */
function ending(after: string, today: Date): { part: string; length: number } | null {
  const count = COUNT.exec(after);
  if (count && Number(count[1]) > 0) {
    return { part: `;COUNT=${String(Number(count[1]))}`, length: count[0].length };
  }
  const until = UNTIL.exec(after);
  if (!until) return null;
  const rest = after.slice(until[0].length);
  const date = chrono.parse(rest, today, { forwardDate: true })[0];
  if (date?.index !== 0) return null;
  // The whole last day counts, since a Task's time can be any time of day.
  const last = format(date.start.date(), "yyyyMMdd");
  return { part: `;UNTIL=${last}T235959`, length: until[0].length + date.text.length };
}

/** Every phrase each pattern finds, with its ending, overlapping ones included. */
function allPhrases(text: string, today: Date): FoundRepeat[] {
  return PATTERNS.flatMap(([pattern, ruleOf]) =>
    [...text.matchAll(pattern)].flatMap((match) => {
      const rule = ruleOf(match.groups ?? {});
      if (rule === null) return [];
      const start = match.index;
      const phraseEnd = start + match[0].length;
      const tail = ending(text.slice(phraseEnd), today);
      const end = phraseEnd + (tail?.length ?? 0);
      return [{ start, end, text: text.slice(start, end), rule: rule + (tail?.part ?? "") }];
    }),
  );
}

/**
 * Every Repeat phrase in the text, left to right, the longest where two start together. `today`
 * is midnight on the user's clock, for reading "until" dates forwards.
 */
export function findRepeats(text: string, today: Date): FoundRepeat[] {
  const sorted = allPhrases(text, today).sort((a, b) => a.start - b.start || b.end - a.end);
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
