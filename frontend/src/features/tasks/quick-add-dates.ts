/*
 * The dates and Repeat in a line of Quick add. chrono-node reads the dates, forwards from now;
 * Repeat phrases are read first by their own grammar and hidden from chrono, which would
 * otherwise take "every monday" for one Monday.
 */

import * as chrono from "chrono-node";
import { addDays, format, parseISO, startOfDay } from "date-fns";

import { dueLabel } from "./due";
import { firstDay, findRepeats, type FoundRepeat } from "./repeat-phrase";
import { repeatLabel } from "./repeat";

/** A new Task's dates; a null time means all-day, a start makes a range. */
export type QuickAddDates = {
  due_date: string;
  due_time: string | null;
  start_date: string | null;
  start_time: string | null;
};

type Span = { start: number; end: number; text: string };

/** A date Quick add understood, with the label its chip shows. */
export type DateMatch = Span & { kind: "date"; label: string; dates: QuickAddDates };
/** A Repeat phrase Quick add understood, as an RRULE and in the user's words. */
export type RepeatMatch = Span & { kind: "repeat"; label: string; rule: string };

type FoundDate = Span & { dates: QuickAddDates; dayGiven: boolean };

const iso = (day: Date) => format(day, "yyyy-MM-dd");
const clock = (day: Date) => format(day, "HH:mm");

/** Words chrono reads as a date that, in a Task, never mean one. */
const NOT_DATES = new Set(["now"]);

/** Whether a result names its day, as "friday" or "3 Nov" do and "9am" doesn't. */
function namesDay({ start }: chrono.ParsedResult): boolean {
  return start.isCertain("day") || start.isCertain("weekday") || start.isCertain("month");
}

/** When a result starts. A time without a day is today while it is still ahead, as in TickTick. */
function startOf(result: chrono.ParsedResult, now: Date): Date {
  const from = result.start.date();
  const passed = result.start.isCertain("hour") && clock(from) <= clock(now);
  return !namesDay(result) && passed ? addDays(from, 1) : from;
}

/** A chrono result as a Task's dates: a range only when it ends after it starts. */
function datesOf(result: chrono.ParsedResult, now: Date): QuickAddDates {
  const from = startOf(result, now);
  const until = result.end?.date();
  // A range is all-day unless both ends have a time.
  const timed = result.start.isCertain("hour") && (result.end?.isCertain("hour") ?? true);
  const day = { due_date: iso(from), due_time: timed ? clock(from) : null };
  const isRange = until !== undefined && (timed ? until > from : iso(until) > iso(from));
  if (!isRange) return { ...day, start_date: null, start_time: null };
  return {
    due_date: iso(until),
    due_time: timed ? clock(until) : null,
    start_date: day.due_date,
    start_time: day.due_time,
  };
}

function* findDates(text: string, now: Date): Generator<FoundDate> {
  // From midnight, so that a date of today still counts as ahead.
  for (const result of chrono.parse(text, startOfDay(now), { forwardDate: true })) {
    if (NOT_DATES.has(result.text.toLowerCase())) continue;
    // chrono leaves the "at" out of "at noon", though not of "at 5pm".
    const at = /(?<!\S)at\s+$/i.exec(text.slice(0, result.index))?.[0].length ?? 0;
    const start = result.index - at;
    const end = result.index + result.text.length;
    const span = { start, end, text: text.slice(start, end) };
    yield { ...span, dates: datesOf(result, now), dayGiven: namesDay(result) };
  }
}

/** The text with the spans blanked out, so that indexes still line up. */
function mask(text: string, spans: readonly Span[]): string {
  let masked = text;
  for (const { start, end } of spans) {
    masked = masked.slice(0, start) + " ".repeat(end - start) + masked.slice(end);
  }
  return masked;
}

/** What `readSchedule` needs to know besides the text. */
export type ScheduleContext = {
  /** Now on the user's clock. */
  now: Date;
  /** False where a Task can't repeat, as in Add subtask: Repeat phrases then stay text. */
  allowRepeat?: boolean;
  /** Whether a match was turned back into text. */
  isKept: (match: DateMatch | RepeatMatch) => boolean;
};

/** The first Repeat phrase not kept as text, as a match. */
function firstRepeat(phrases: readonly FoundRepeat[], isKept: ScheduleContext["isKept"]) {
  return phrases
    .map((found): RepeatMatch => ({ ...found, kind: "repeat", label: repeatLabel(found.rule) }))
    .find((match) => !isKept(match));
}

/** The new Task's dates: those typed, or else the Repeat's first day, at any time typed. */
function scheduleDates(found: FoundDate | undefined, repeat: RepeatMatch | undefined, today: Date) {
  if (!repeat || found?.dayGiven) return found?.dates ?? null;
  const dates = found?.dates ?? { due_time: null, start_date: null, start_time: null };
  const from = found ? parseISO(found.dates.due_date) : today;
  return { ...dates, due_date: iso(firstDay(repeat.rule, from)) };
}

/**
 * The first date and the first Repeat in the text outside the spans already taken, and the
 * dates they give a new Task. A Repeat without a date starts on its first day.
 */
export function readSchedule(text: string, taken: readonly Span[], context: ScheduleContext) {
  const { now, allowRepeat = true, isKept } = context;
  const today = startOfDay(now);
  const free = mask(text, taken);
  const phrases = findRepeats(free, today);
  const repeat = allowRepeat ? firstRepeat(phrases, isKept) : undefined;
  const found = [...findDates(mask(free, phrases), now)].find(
    (date) => !isKept({ ...date, kind: "date", label: "" }),
  );
  const dates = scheduleDates(found, repeat, today);
  const date: DateMatch | undefined =
    found && dates ? { ...found, kind: "date", label: dueLabel(dates, now), dates } : undefined;
  return {
    matches: [repeat, date].filter((match) => match !== undefined),
    dates,
    repeatRule: repeat?.rule ?? null,
  };
}
