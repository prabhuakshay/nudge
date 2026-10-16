import { plainMentions } from "@/features/people/mentions";
import { shortTime } from "@/features/tasks/due";
import { STATUS } from "@/features/tasks/task-properties";

import { dayName } from "./day-label";
import type { CalendarItem } from "./occurrences";

function when(date: string, time: string | null) {
  const day = dayName(date);
  return time === null ? day : `${day}, ${shortTime(time)}`;
}

/** A Task's dates read aloud; a range within one day names the day once. */
function datesLabel({ due_date, due_time, start_date, start_time }: CalendarItem) {
  const due = due_date ?? "";
  if (start_date === null || (start_date === due && start_time === null)) {
    return when(due, due_time);
  }
  if (start_date === due && due_time !== null) {
    return `${when(due, start_time)} – ${shortTime(due_time)}`;
  }
  return `${when(start_date, start_time)} – ${when(due, due_time)}`;
}

/** What a screen reader hears for a Task on the Calendar: its title, dates, Project and state. */
export function taskLabel(task: CalendarItem, projectName: string | undefined) {
  return [
    plainMentions(task.title),
    task.parent_title !== null && `Subtask of ${plainMentions(task.parent_title)}`,
    datesLabel(task),
    projectName !== undefined && `in ${projectName}`,
    task.status !== "open" && STATUS[task.status].label.toLowerCase(),
    task.is_overdue && "overdue",
    task.occurrence && "future Occurrence",
  ]
    .filter(Boolean)
    .join(", ");
}
