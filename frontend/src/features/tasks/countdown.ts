import { differenceInCalendarDays, parseISO } from "date-fns";

import { startsOn } from "./schedule";
import { isClosed } from "./task-properties";
import type { Task } from "./tasks";

type CountdownTask = Pick<Task, "countdown" | "status" | "is_overdue" | "due_date" | "start_date">;

/**
 * How many calendar days are left from `today`, the user's ISO date, until a Countdown's day: a
 * range's start, a repeating Task's current Occurrence. Null when the Task shows no countdown:
 * it isn't one, it's Closed, or its day has passed and it shows as Overdue instead.
 */
export function daysLeft(task: CountdownTask, today: string): number | null {
  const day = startsOn(task);
  if (!task.countdown || day === null || isClosed(task.status) || task.is_overdue) return null;
  const days = differenceInCalendarDays(parseISO(day), parseISO(today));
  return days < 0 ? null : days;
}

/** What a Countdown's badge says: "Today", "Tomorrow" or "12 days left". */
export function countdownLabel(days: number): string {
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `${String(days)} days left`;
}

/** What Today's header says about a Countdown still to come: "Exam in 12 days". */
export function countdownHeadline(title: string, days: number): string {
  return days === 1 ? `${title} tomorrow` : `${title} in ${String(days)} days`;
}

/**
 * The open Countdown with the soonest day after today, and its days left; a tie goes to the first
 * listed.
 */
export function soonestCountdown<T extends CountdownTask>(
  tasks: T[],
  today: string,
): { task: T; days: number } | undefined {
  let soonest: { task: T; days: number } | undefined;
  for (const task of tasks) {
    const days = daysLeft(task, today);
    if (days !== null && days > 0 && (soonest === undefined || days < soonest.days)) {
      soonest = { task, days };
    }
  }
  return soonest;
}
