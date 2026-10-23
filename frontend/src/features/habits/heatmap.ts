import { addMonths, format, parseISO, startOfMonth, startOfWeek } from "date-fns";

import { addDays } from "@/features/tasks/schedule";

import type { Habit } from "./habits";
import { isScheduled } from "./recent-days";

/** How many months the heatmap covers, this one included. */
const MONTHS_SHOWN = 12;

/**
 * The heatmap's days as Monday-to-Sunday weeks of ISO dates, oldest first: from the week of the
 * 1st of the month eleven months back to the end of the week holding `today`.
 */
export function heatmapWeeks(today: string): string[][] {
  const firstOfMonth = startOfMonth(addMonths(parseISO(today), 1 - MONTHS_SHOWN));
  let monday = format(startOfWeek(firstOfMonth, { weekStartsOn: 1 }), "yyyy-MM-dd");
  const weeks: string[][] = [];
  while (monday <= today) {
    const start = monday;
    weeks.push(Array.from({ length: 7 }, (_, day) => addDays(start, day)));
    monday = addDays(monday, 7);
  }
  return weeks;
}

/** How strongly a heatmap cell is shaded: 0 for no Check-ins up to 4 for a day that met the Goal. */
export type ShadeLevel = 0 | 1 | 2 | 3 | 4;

/**
 * How a heatmap cell looks and whether the user can change it. `dimmed` marks a day the Habit
 * doesn't ask for or one before its start date; only days from the start date to today are
 * `editable`.
 */
export type CellShade = { level: ShadeLevel; dimmed: boolean; editable: boolean };

/**
 * The shade of an ISO date's heatmap cell with `count` Check-ins: the share of the Goal met, in
 * thirds below the Goal and in full once it is met. `today` is the user's.
 */
export function cellShade(habit: Habit, date: string, count: number, today: string): CellShade {
  return {
    level: levelOf(count, habit.goal),
    dimmed: !isScheduled(habit, date),
    editable: date >= habit.start_date && date <= today,
  };
}

function levelOf(count: number, goal: number): ShadeLevel {
  if (count >= goal) return 4;
  if (count <= 0) return 0;
  // Below the Goal, a share in (0, 1) rounds up to 1, 2 or 3.
  return Math.ceil((count / goal) * 3) as ShadeLevel;
}
