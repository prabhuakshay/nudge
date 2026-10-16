import { format, parseISO } from "date-fns";

/** A day as people say it, "Thursday 15 October", where the year goes without saying. */
export function dayName(day: string): string {
  return format(parseISO(day), "EEEE d MMMM");
}

/** A day in full, "Thursday 15 October 2026", ending ", today" when it is today. */
export function dayLabel(day: string, isToday = false): string {
  const label = format(parseISO(day), "EEEE d MMMM yyyy");
  return isToday ? `${label}, today` : label;
}
