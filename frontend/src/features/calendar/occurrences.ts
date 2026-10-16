import type { Task } from "@/features/tasks/tasks";

import type { CalendarRange } from "./calendar";
import { moveDates } from "./reschedule";

/**
 * What the Calendar draws on a day: a Task, or a future Occurrence of a repeating one, which is
 * the Task with the dates it will have then. An Occurrence opens its Task but can't be ticked
 * or dragged, since it doesn't exist yet.
 */
export type CalendarItem = Task & { occurrence?: true };

/** The range's future Occurrences, each as its Task moved to the day it comes back on. */
export function futureOccurrences({ occurrences, repeating }: CalendarRange): CalendarItem[] {
  const tasks = new Map(repeating.map((task) => [task.id, task]));
  return occurrences.flatMap(({ task_id, date }) => {
    const task = tasks.get(task_id);
    const due = task?.due_date ?? null;
    if (task === undefined || due === null) return [];
    const dates = moveDates({ ...task, due_date: due }, due, date);
    return [{ ...task, ...dates, status: "open", is_overdue: false, occurrence: true }];
  });
}
