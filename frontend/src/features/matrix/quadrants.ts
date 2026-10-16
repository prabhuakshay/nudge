import { addDays, startsOn } from "@/features/tasks/schedule";
import type { Task } from "@/features/tasks/tasks";

/** The Matrix's four Quadrants, Important on top and Urgent on the left, in reading order. */
export const QUADRANTS = ["urgent-important", "important", "urgent", "neither"] as const;

export type Quadrant = (typeof QUADRANTS)[number];

/** Whether the Task matters: P1 or P2. */
function isImportant(task: Task): boolean {
  return task.priority === 1 || task.priority === 2;
}

/**
 * Whether the Task presses: Overdue, as the server decides it, or dated (a range by its start)
 * on or before tomorrow. A Task with no date never presses.
 */
function isUrgent(task: Task, today: string): boolean {
  const from = startsOn(task);
  return task.is_overdue || (from !== null && from <= addDays(today, 1));
}

/** The Quadrant a Task falls in on `today`, the user's ISO date. */
export function quadrantOf(task: Task, today: string): Quadrant {
  if (isImportant(task)) return isUrgent(task, today) ? "urgent-important" : "important";
  return isUrgent(task, today) ? "urgent" : "neither";
}

/** What each Quadrant is called on screen. */
export const QUADRANT_LABEL: Record<Quadrant, string> = {
  "urgent-important": "Urgent & Important",
  important: "Important not urgent",
  urgent: "Urgent not important",
  neither: "Neither",
};

/** The Matrix's Tasks by Quadrant. */
export type MatrixQuadrants = Record<Quadrant, Task[]>;

/** No Priority sorts after P4. */
function priorityRank(task: Task): number {
  return task.priority === 0 ? 5 : task.priority;
}

/**
 * Pinned Tasks first, then by date (a range by its start), undated last, then by Priority. Ties
 * keep the server's order.
 */
function byPinThenDateThenPriority(a: Task, b: Task): number {
  const pinned = Number(b.pinned_at !== null) - Number(a.pinned_at !== null);
  if (pinned !== 0) return pinned;
  const aDate = startsOn(a);
  const bDate = startsOn(b);
  if (aDate !== bDate) {
    if (aDate === null) return 1;
    if (bDate === null) return -1;
    return aDate < bDate ? -1 : 1;
  }
  return priorityRank(a) - priorityRank(b);
}

/**
 * All's open root Tasks sorted into Quadrants, leaving Subtasks out. Each Quadrant is sorted here
 * rather than trusted to the server's order, so a Task whose date just changed moves at once.
 */
export function matrixQuadrants(tasks: Task[], today: string): MatrixQuadrants {
  const quadrants: MatrixQuadrants = {
    "urgent-important": [],
    important: [],
    urgent: [],
    neither: [],
  };
  for (const task of tasks) {
    if (task.parent_id === null) quadrants[quadrantOf(task, today)].push(task);
  }
  for (const id of QUADRANTS) quadrants[id].sort(byPinThenDateThenPriority);
  return quadrants;
}
