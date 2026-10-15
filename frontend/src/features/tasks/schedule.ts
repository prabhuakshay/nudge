import { addDays as addCalendarDays, differenceInCalendarDays, format, parseISO } from "date-fns";

import type { Task } from "./tasks";

/** The views that list Tasks by their dates. The server decides which Tasks each one holds. */
export type ScheduleView = "today" | "upcoming";

/** Upcoming names each of the next this-many days; later Tasks are grouped by month. */
const DAYS_BY_NAME = 7;

/** Today's date as an ISO string on the user's clock, which can differ from the browser's. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  // The Canadian English format is ISO: YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(now);
}

/** The ISO date the given number of days after another. */
export function addDays(date: string, days: number): string {
  return format(addCalendarDays(parseISO(date), days), "yyyy-MM-dd");
}

/** A heading in Upcoming and the Tasks under it, in the server's order. */
export type UpcomingGroup = { key: string; label: string; hint: string | null; tasks: Task[] };

function groupOf(task: Task, today: string): Omit<UpcomingGroup, "tasks"> {
  // The server only sends dated Tasks; a range goes on the day it starts.
  const date = parseISO(task.start_date ?? task.due_date ?? today);
  const days = differenceInCalendarDays(date, parseISO(today));
  if (days <= DAYS_BY_NAME) {
    const label = days === 1 ? "Tomorrow" : format(date, "EEEE");
    return { key: format(date, "yyyy-MM-dd"), label, hint: format(date, "d MMM") };
  }
  const sameYear = date.getFullYear() === parseISO(today).getFullYear();
  return {
    key: format(date, "yyyy-MM"),
    label: format(date, sameYear ? "MMMM" : "MMMM yyyy"),
    hint: null,
  };
}

/**
 * Upcoming's Tasks under headings: a day each for the coming week, Tomorrow first, then a month
 * each. The server sends them sorted by day, so each heading's Tasks are already in order.
 */
export function upcomingGroups(tasks: Task[], today: string): UpcomingGroup[] {
  const groups: UpcomingGroup[] = [];
  for (const task of tasks) {
    const group = groupOf(task, today);
    const last = groups.at(-1);
    if (last?.key === group.key) last.tasks.push(task);
    else groups.push({ ...group, tasks: [task] });
  }
  return groups;
}
