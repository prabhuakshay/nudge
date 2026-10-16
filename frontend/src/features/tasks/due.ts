import { differenceInCalendarDays, format, parseISO } from "date-fns";

import { startsOn } from "./schedule";
import type { Task } from "./tasks";

/**
 * A Task's due date, time and range as the API sends them: ISO dates and "HH:MM:SS" times, all
 * clock times in the user's zone. No time means all-day; a start date makes a range.
 */
export type Dates = Pick<Task, "due_date" | "due_time" | "start_date" | "start_time">;

export const NO_DATES: Dates = {
  due_date: null,
  due_time: null,
  start_date: null,
  start_time: null,
};

/** How soon a due date is, which sets its colour. */
export type DueTone = "overdue" | "today" | "tomorrow" | "week" | "later";

/** Text colour per tone. */
export const DUE_TONE_CLASS: Record<DueTone, string> = {
  overdue: "text-warning",
  today: "text-success",
  tomorrow: "text-p2",
  week: "text-hue-violet",
  later: "text-muted-foreground",
};

/** "09:00:00" → "09:00". */
export function shortTime(time: string): string {
  return time.slice(0, 5);
}

/** A day relative to today, like TickTick: "Today", "Tomorrow", "Friday", "Last Sat", "6 Nov". */
function dayLabel(date: string, now: Date): string {
  const day = parseISO(date);
  const diff = differenceInCalendarDays(day, now);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 1 && diff < 7) return format(day, "EEEE");
  if (diff < -1 && diff > -7) return `Last ${format(day, "EEE")}`;
  return format(day, day.getFullYear() === now.getFullYear() ? "d MMM" : "d MMM yyyy");
}

function withTime(day: string, time: string | null): string {
  return time === null ? day : `${day}, ${shortTime(time)}`;
}

/** Joins a range's ends, naming the day once when both fall on it. */
function range(dates: Dates, day: (date: string) => string): string {
  const { due_date: due, due_time: dueTime, start_date: start, start_time: startTime } = dates;
  if (due === null) return "";
  if (start === null) return withTime(day(due), dueTime);
  if (start === due && startTime !== null && dueTime !== null) {
    return `${withTime(day(due), startTime)} – ${shortTime(dueTime)}`;
  }
  return `${withTime(day(start), startTime)} – ${withTime(day(due), dueTime)}`;
}

/** The short label a row or chip shows, such as "Tomorrow, 09:00" or "3 Nov – 5 Nov". */
export function dueLabel(dates: Dates, now: Date): string {
  return range(dates, (date) => dayLabel(date, now));
}

/** The dates in full, for tooltips and Activity: "3 Nov 2026, 22:00 – 4 Nov 2026, 06:30". */
export function describeDates(dates: Dates): string {
  return range(dates, (date) => format(parseISO(date), "d MMM yyyy"));
}

/**
 * How soon the Task is due. The server decides overdue, in the user's zone; otherwise a range
 * that has started counts as today, and one that hasn't is as soon as its start.
 */
export function dueTone(dates: Dates & Pick<Task, "is_overdue">, now: Date): DueTone {
  if (dates.is_overdue) return "overdue";
  const from = startsOn(dates);
  if (from === null) return "later";
  const starts = differenceInCalendarDays(parseISO(from), now);
  const diff = Math.max(starts, 0);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff < 7) return "week";
  return "later";
}

/** Whether the range starts after it's due, which the server refuses. */
function startsLate({ due_date, due_time, start_date, start_time }: Dates): boolean {
  if (start_date === null || due_date === null) return false;
  return `${start_date}T${start_time ?? ""}` > `${due_date}T${due_time ?? ""}`;
}

/**
 * Apply a change to the dates, keeping the range valid: a start follows the due's all-day or
 * timed kind, taking the due time when it needs one, and a start that ends up after the due is
 * dropped. Clearing the due date clears everything.
 */
export function changeDates(dates: Dates, change: Partial<Dates>): Dates {
  const { due_date, due_time, start_date, start_time } = dates;
  const next = { due_date, due_time, start_date, start_time, ...change };
  if (next.due_date === null) return NO_DATES;
  if (next.start_date === null) return { ...next, start_time: null };
  const startTime = next.due_time === null ? null : (next.start_time ?? next.due_time);
  const settled = { ...next, start_time: startTime };
  return startsLate(settled) ? { ...settled, start_date: null, start_time: null } : settled;
}

/** What a screen reader hears for a Task's dates, since colour alone can't say it's overdue. */
export function dueName(dates: Dates & Pick<Task, "is_overdue">, now: Date): string {
  if (dates.due_date === null) return "none";
  const label = dueLabel(dates, now);
  return dates.is_overdue ? `${label}, overdue` : label;
}
