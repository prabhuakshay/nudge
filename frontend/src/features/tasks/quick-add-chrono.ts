/*
 * chrono-node, taught the shorthand Quick add accepts and the defaults it follows:
 *
 * - "tod"/"tdy" are today and "tom" (lower case, since "Tom" is a name) is tomorrow.
 * - "eow"/"end of week" is Friday, "eom"/"end of month" the month's last day, "eoy"/"end of
 *   year" 31 December; "next week" is next Monday, "next month" the 1st, "next year" 1 January.
 * - "the 3rd" is the next 3rd of a month; a bare "3rd" only when no word follows, so "3rd floor"
 *   stays text.
 * - Parts of the day are times: morning 09:00, afternoon 15:00, evening 18:00, night and
 *   tonight 20:00. "5p" is 17:00 and "half past 5" 17:30.
 * - An hour from 1 to 6 without am or pm is in the afternoon, as in "at 5" or "9 to 5".
 */

import * as chrono from "chrono-node";
import { addDays, addMonths, getDaysInMonth, lastDayOfMonth, nextMonday } from "date-fns";

/** The time each part of the day stands for, in Quick add's dates and Repeats. */
export const PART_OF_DAY: Record<string, string> = {
  morning: "09:00",
  afternoon: "15:00",
  evening: "18:00",
  night: "20:00",
  tonight: "20:00",
};

type Components = Partial<Record<chrono.Component, number>>;

const dayOf = (date: Date): Components => ({
  year: date.getFullYear(),
  month: date.getMonth() + 1,
  day: date.getDate(),
});

function assignDay(components: chrono.ParsingComponents, date: Date) {
  components.assign("year", date.getFullYear());
  components.assign("month", date.getMonth() + 1);
  components.assign("day", date.getDate());
}

/** Whether the match is a word of its own in the whole text, not part of a longer one. */
function standsAlone(context: chrono.ParsingContext, match: RegExpMatchArray): boolean {
  const index = match.index ?? 0;
  const before = context.text.charAt(index - 1);
  const after = context.text.charAt(index + match[0].length);
  return !/\w/.test(before) && !/\w/.test(after);
}

/** A parser for a pattern whose meaning only depends on the day it's read on. */
function parser(
  pattern: RegExp,
  extract: (
    match: RegExpMatchArray,
    today: Date,
    context: chrono.ParsingContext,
  ) => Components | null,
): chrono.Parser {
  return {
    pattern: () => pattern,
    extract: (context, match) =>
      standsAlone(context, match) ? extract(match, context.refDate, context) : null,
  };
}

const SHORT_DAYS: Record<string, number> = { tod: 0, tdy: 0, tom: 1 };

function endOf(unit: string, today: Date): Date {
  if (unit === "week" || unit === "w") return addDays(today, (5 - today.getDay() + 7) % 7);
  if (unit === "month" || unit === "m") return lastDayOfMonth(today);
  return new Date(today.getFullYear(), 11, 31);
}

/** The next day on or after today that is the day-th of its month. */
function nextMonthDay(day: number, today: Date): Date | null {
  if (day < 1 || day > 31) return null;
  for (let month = day >= today.getDate() ? 0 : 1; month < 12; month++) {
    const first = addMonths(new Date(today.getFullYear(), today.getMonth(), 1), month);
    if (day <= getDaysInMonth(first)) return new Date(first.getFullYear(), first.getMonth(), day);
  }
  return null;
}

const MINUTES: Record<string, number> = { half: 30, quarter: 15 };

const PARSERS: chrono.Parser[] = [
  // Case-sensitive, so that "Tom" stays a name.
  parser(/tod|tdy|tom/, (match, today) => dayOf(addDays(today, SHORT_DAYS[match[0]] ?? 0))),
  parser(/(?:the\s+)?day\s+after\s+tomorrow/i, (_match, today) => dayOf(addDays(today, 2))),
  parser(/end\s+of\s+(?:the\s+)?(week|month|year)|eo(w|m|y)/i, (match, today) =>
    dayOf(endOf((match[1] ?? match[2] ?? "").toLowerCase(), today)),
  ),
  parser(/(on\s+)?(the\s+)?(\d{1,2})(?:st|nd|rd|th)/i, (match, today, context) => {
    const after = context.text.slice((match.index ?? 0) + match[0].length);
    const wordFollows = /^\s+(?!(?:at|on|by)\b)[a-z]/i.test(after);
    const day = nextMonthDay(Number(match[3]), today);
    return day && (match[1] || !wordFollows) ? dayOf(day) : null;
  }),
  parser(/(\d{1,2})(?::(\d{2}))?([ap])/i, (match) => {
    const hour = Number(match[1]);
    if (hour < 1 || hour > 12) return null;
    const pm = match[3]?.toLowerCase() === "p";
    return {
      hour: (hour % 12) + (pm ? 12 : 0),
      minute: Number(match[2] ?? 0),
      meridiem: pm ? 1 : 0,
    };
  }),
  parser(/(half|quarter)\s+(past|to)\s+(\d{1,2})/i, (match) => {
    const hour = Number(match[3]);
    if (hour < 1 || hour > 12) return null;
    const minutes = MINUTES[match[1]?.toLowerCase() ?? ""] ?? 0;
    const past = match[2]?.toLowerCase() === "past";
    return past ? { hour, minute: minutes } : { hour: hour - 1, minute: 60 - minutes };
  }),
];

/** Moves "next week", "next month" and "next year" to the start of that week, month or year. */
function startOfNext(result: chrono.ParsingResult, today: Date) {
  const unit = /^next\s+(week|month|year)\b/i.exec(result.text)?.[1]?.toLowerCase();
  if (!unit || result.start.isCertain("weekday")) return;
  const day =
    unit === "week"
      ? nextMonday(today)
      : unit === "month"
        ? addMonths(new Date(today.getFullYear(), today.getMonth(), 1), 1)
        : new Date(today.getFullYear() + 1, 0, 1);
  assignDay(result.start, day);
}

/** Gives a part of the day its time, unless a time was given too. */
function partOfDay(result: chrono.ParsingResult) {
  const part = /\b(morning|afternoon|evening|tonight|night)\b/i.exec(result.text)?.[1];
  const time = PART_OF_DAY[part?.toLowerCase() ?? ""];
  if (time === undefined || result.start.isCertain("hour")) return;
  result.start.assign("hour", Number(time.slice(0, 2)));
  result.start.assign("minute", Number(time.slice(3)));
}

/** Moves an hour from 1 to 6 without am or pm into the afternoon; whether it did. */
function toAfternoon(components: chrono.ParsingComponents, leadingZero: boolean): boolean {
  const hour = components.get("hour") ?? 0;
  const unsure = components.isCertain("hour") && !components.isCertain("meridiem");
  if (!unsure || leadingZero || hour < 1 || hour > 6) return false;
  components.assign("hour", hour + 12);
  components.assign("meridiem", 1);
  return true;
}

/** An hour from 1 to 6 without am or pm is in the afternoon, as working hours are. */
function afternoonHours(result: chrono.ParsingResult) {
  // "05:00" is written on a 24-hour clock.
  const leadingZero = /(?:^|\D)0\d:/.test(result.text);
  toAfternoon(result.start, leadingZero);
  const { start, end } = result;
  if (!end || !toAfternoon(end, leadingZero)) return;
  // chrono moved an end before the start to the next day, which the later hour undoes.
  const dayEarlier = addDays(end.date(), -1);
  if (dayEarlier > start.date()) assignDay(end, dayEarlier);
}

const REFINER: chrono.Refiner = {
  refine: (context, results) => {
    for (const result of results) {
      startOfNext(result, context.refDate);
      partOfDay(result);
      afternoonHours(result);
    }
    return results;
  },
};

function teach(base: chrono.Chrono): chrono.Chrono {
  const taught = base.clone();
  taught.parsers.push(...PARSERS);
  taught.refiners.push(REFINER);
  return taught;
}

/**
 * 3/11 read day first. chrono's own day-first English also reads "dec 31" as December 2031, so
 * this replaces only how slashes read, by coming before chrono's own parser for the same text.
 */
const DAY_FIRST_SLASH = parser(/(\d{1,2})\/(\d{1,2})(?:\/(\d{4}|\d{2}))?/, (match) => {
  const [first, second] = [Number(match[1]), Number(match[2])];
  const [day, month] = second > 12 ? [second, first] : [first, second];
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const year = match[3] && Number(match[3]) + (match[3].length === 2 ? 2000 : 0);
  return year ? { day, month, year } : { day, month };
});

const MONTH_FIRST = teach(chrono.casual);
const DAY_FIRST = teach(chrono.casual);
DAY_FIRST.parsers.unshift(DAY_FIRST_SLASH);

/** Whether the locale writes the day before the month, as in 3/11 for 3 November. */
export function isDayFirst(locale?: string): boolean {
  const parts = new Intl.DateTimeFormat(locale).formatToParts(new Date(2000, 10, 3));
  const types = parts.map((part) => part.type);
  return types.indexOf("day") < types.indexOf("month");
}

/** Quick add's chrono, reading 3/11 as the locale writes dates. */
export function quickAddChrono(dayFirst: boolean): chrono.Chrono {
  return dayFirst ? DAY_FIRST : MONTH_FIRST;
}
