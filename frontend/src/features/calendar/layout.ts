import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";

import type { Dates } from "@/features/tasks/due";

/*
 * Pure layout for the Calendar: which days a grid shows and which Tasks fall on each. Days are ISO
 * dates ("2026-10-15") on the user's clock, as the API sends them, so no time zone comes in here.
 */

/** Weeks start on Monday, as in the date picker. */
const WEEK_STARTS_ON = 1;

function iso(day: Date): string {
  return format(day, "yyyy-MM-dd");
}

/** The month around a date as whole weeks from Monday: four to six rows of seven days. */
export function monthWeeks(date: string): string[][] {
  const day = parseISO(date);
  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(day), { weekStartsOn: WEEK_STARTS_ON }),
    end: endOfWeek(endOfMonth(day), { weekStartsOn: WEEK_STARTS_ON }),
  }).map(iso);
  const weeks: string[][] = [];
  for (let start = 0; start < days.length; start += 7) {
    weeks.push(days.slice(start, start + 7));
  }
  return weeks;
}

/** The date the given number of months away, on the same day or the month's last if it's shorter. */
export function shiftMonths(date: string, months: number): string {
  return iso(addMonths(parseISO(date), months));
}

/** The date the given number of days away. */
export function shiftDays(date: string, days: number): string {
  return iso(addDays(parseISO(date), days));
}

/** Whether a Task's dates cover a day: its due date, or every day of its range. */
export function coversDay(dates: Dates, day: string): boolean {
  if (dates.due_date === null) return false;
  return (dates.start_date ?? dates.due_date) <= day && day <= dates.due_date;
}

/** The Tasks whose dates cover a day, in the order given. */
export function tasksOn<T extends Dates>(tasks: readonly T[], day: string): T[] {
  return tasks.filter((task) => coversDay(task, day));
}
