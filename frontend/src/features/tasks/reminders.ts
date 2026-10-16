import { format, parseISO } from "date-fns";

import type { Dates } from "./due";
import type { DatesIn } from "./tasks";

/*
 * A Reminder is an offset in minutes from a Task's start (for a range) or due time; negative is
 * before. An all-day Task counts from the start of its day, so 540 is 09:00 on the day.
 */

export const MAX_REMINDERS = 10;
export const MAX_OFFSET_DAYS = 365;

const HOUR = 60;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const NINE_AM = 9 * HOUR;

/** The one-tap Reminders, as in TickTick: before the due time, or at 09:00 for all-day Tasks. */
export const PRESETS = {
  timed: [0, -5, -30, -HOUR, -DAY],
  allDay: [NINE_AM, NINE_AM - DAY, NINE_AM - 2 * DAY, NINE_AM - WEEK],
};

/** Whether the Task's Reminders count from the start of a day rather than a time. */
export function isAllDay(dates: Dates): boolean {
  return dates.due_time === null;
}

function count(amount: number, unit: string): string {
  return `${String(amount)} ${unit}${amount === 1 ? "" : "s"}`;
}

/** A span of minutes in its largest whole unit: "30 minutes", "1 hour", "2 weeks". */
function span(minutes: number): string {
  if (minutes % WEEK === 0) return count(minutes / WEEK, "week");
  if (minutes % DAY === 0) return count(minutes / DAY, "day");
  if (minutes % HOUR === 0) return count(minutes / HOUR, "hour");
  return count(minutes, "minute");
}

function clock(minuteOfDay: number): string {
  const hours = String(Math.floor(minuteOfDay / HOUR)).padStart(2, "0");
  return `${hours}:${String(minuteOfDay % HOUR).padStart(2, "0")}`;
}

/** A Reminder in the user's words: "30 minutes before", or "1 day before, 09:00" when all-day. */
export function reminderLabel(offset: number, allDay: boolean): string {
  if (!allDay) {
    if (offset === 0) return "On time";
    return `${span(Math.abs(offset))} ${offset < 0 ? "before" : "after"}`;
  }
  const day = Math.floor(offset / DAY);
  const at = clock(offset - day * DAY);
  if (day === 0) return `On the day, ${at}`;
  return `${span(Math.abs(day) * DAY)} ${day < 0 ? "before" : "after"}, ${at}`;
}

/** Several Reminders, earliest first, or "None". */
export function remindersLabel(offsets: number[], allDay: boolean): string {
  if (offsets.length === 0) return "None";
  return [...offsets]
    .sort((a, b) => a - b)
    .map((offset) => reminderLabel(offset, allDay))
    .join(", ");
}

/**
 * When a Reminder fires, as a clock time in the user's zone. The offset moves the clock, not the
 * instant, as on the server, so "09:00 the day before" stays 09:00 across a daylight saving change.
 */
export function fireTime(dates: Dates, offset: number): Date | null {
  const day = dates.start_date ?? dates.due_date;
  if (day === null) return null;
  const time = (dates.start_date === null ? dates.due_time : dates.start_time) ?? "00:00";
  const anchor = parseISO(`${day}T${time}`);
  return new Date(
    anchor.getFullYear(),
    anchor.getMonth(),
    anchor.getDate(),
    anchor.getHours(),
    anchor.getMinutes() + offset,
  );
}

/** A fire time as a preview shows it: "Fri 6 Nov, 13:30". */
export function describeFireTime(fire: Date): string {
  return format(fire, "EEE d MMM, HH:mm");
}

/** The Reminders a change leaves, without fire times, which only the server works out. */
export function remindersAfter(reminders: number[] | undefined, dates: DatesIn | undefined) {
  if (reminders !== undefined) {
    const offsets = [...reminders].sort((a, b) => a - b);
    return { reminders: offsets.map((offset) => ({ offset, fire_at: null })) };
  }
  return dates === null && { reminders: [] };
}
