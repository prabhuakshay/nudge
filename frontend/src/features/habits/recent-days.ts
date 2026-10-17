import { parseISO } from "date-fns";

import { addDays } from "@/features/tasks/schedule";

import type { CheckIn, Habit } from "./habits";

/** How a day went: Goal met, some Check-ins, none, or a day the Habit doesn't ask for. */
export type DayState = "done" | "partial" | "none" | "unscheduled";

/** One of a Habit's recent days, as its row shows it. */
export type RecentDay = { date: string; count: number; state: DayState };

/** How many days a Habit's row shows, today included. */
const DAYS_SHOWN = 7;

/**
 * Whether the Habit asks to be done on an ISO date: never before its start date, only on its
 * chosen weekdays for a weekday Habit, and on any day for a daily or times-a-week one.
 */
export function isScheduled(habit: Habit, date: string): boolean {
  if (date < habit.start_date) return false;
  if (habit.frequency !== "weekdays") return true;
  // ISO weekdays run 1 (Monday) to 7 (Sunday); `getDay` gives 0 for Sunday.
  return habit.weekdays.includes(parseISO(date).getDay() || 7);
}

/**
 * The last seven days up to `today`, oldest first, each with its Check-ins from `checkIns` and
 * how it went. Today's count comes from the Habit, so a Check-in shows on its dot at once.
 */
export function lastSevenDays(habit: Habit, today: string, checkIns: CheckIn[]): RecentDay[] {
  const counts = new Map(checkIns.map((checkIn) => [checkIn.date, checkIn.count]));
  return Array.from({ length: DAYS_SHOWN }, (_, index) => {
    const date = addDays(today, index - DAYS_SHOWN + 1);
    const count = date === today ? habit.today_count : (counts.get(date) ?? 0);
    return { date, count, state: dayState(habit, date, count) };
  });
}

/** How a day with `count` Check-ins went for the Habit. */
export function dayState(habit: Habit, date: string, count: number): DayState {
  if (count >= habit.goal) return "done";
  if (count > 0) return "partial";
  return isScheduled(habit, date) ? "none" : "unscheduled";
}

const SAYS: Record<DayState, (count: number, goal: number) => string> = {
  done: () => "done",
  partial: (count, goal) => `${String(count)} of ${String(goal)}`,
  none: () => "not done",
  unscheduled: () => "not asked for",
};

/** How a day went in words, such as "done" or "1 of 2", for screen readers. */
export function describeDay(state: DayState, count: number, goal: number): string {
  return SAYS[state](count, goal);
}
