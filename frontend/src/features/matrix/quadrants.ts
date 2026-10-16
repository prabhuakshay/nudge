import { addDays, startsOn } from "@/features/tasks/schedule";
import type { Task, TaskPriority } from "@/features/tasks/tasks";

/** The Matrix's four Quadrants, Important on top and Urgent on the left, in reading order. */
export const QUADRANTS = ["urgent-important", "important", "urgent", "neither"] as const;

export type Quadrant = (typeof QUADRANTS)[number];

/** Where a Quadrant sits, what it is called and coloured, and the Priority it gives Tasks. */
type QuadrantInfo = {
  /** What the Quadrant is called on screen. */
  label: string;
  /** Whether its row holds Important Tasks: P1 or P2. */
  important: boolean;
  /** Whether its column holds Urgent Tasks: Overdue, or dated on or before tomorrow. */
  urgent: boolean;
  /** Its colour, as TickTick colours them: red, amber, blue and green. */
  accent: string;
  /** The Priority Quick add gives a Task added here; an Urgent Quadrant also gives it today. */
  addedPriority: Exclude<TaskPriority, 0> | null;
  /** The Priority a Task dragged in from the other row takes: the smallest change that moves it. */
  droppedPriority: Exclude<TaskPriority, 0>;
};

/** Each Quadrant's place, label, accent and Priorities. */
export const QUADRANT: Record<Quadrant, QuadrantInfo> = {
  "urgent-important": {
    label: "Urgent & Important",
    important: true,
    urgent: true,
    accent: "bg-hue-red",
    addedPriority: 1,
    droppedPriority: 2,
  },
  important: {
    label: "Important not urgent",
    important: true,
    urgent: false,
    accent: "bg-hue-amber",
    addedPriority: 2,
    droppedPriority: 2,
  },
  urgent: {
    label: "Urgent not important",
    important: false,
    urgent: true,
    accent: "bg-hue-blue",
    addedPriority: null,
    droppedPriority: 3,
  },
  neither: {
    label: "Neither",
    important: false,
    urgent: false,
    accent: "bg-hue-green",
    addedPriority: null,
    droppedPriority: 3,
  },
};

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
  const important = isImportant(task);
  const urgent = isUrgent(task, today);
  const found = QUADRANTS.find(
    (id) => QUADRANT[id].important === important && QUADRANT[id].urgent === urgent,
  );
  // The four Quadrants cover every pairing, so nothing reaches the fallback.
  return found ?? "neither";
}

/** The Matrix's Tasks by Quadrant. */
export type MatrixQuadrants = Record<Quadrant, Task[]>;

/** No Priority sorts after P4. */
function priorityRank(task: Task): number {
  return task.priority === 0 ? 5 : task.priority;
}

/**
 * When a Task begins, a range by its start, as text that sorts by date, then a day's all-day Tasks
 * before its timed ones, as the Calendar orders them, then by time. Null when undated.
 */
function startKey(task: Task): string | null {
  const date = startsOn(task);
  if (date === null) return null;
  const time = task.start_date === null ? task.due_time : task.start_time;
  return `${date}T${time ?? ""}`;
}

/**
 * Pinned Tasks first, then by date and time (a range by its start), undated last, then by
 * Priority. Ties keep the server's order.
 */
function byPinThenDateThenPriority(a: Task, b: Task): number {
  const pinned = Number(b.pinned_at !== null) - Number(a.pinned_at !== null);
  if (pinned !== 0) return pinned;
  const aDate = startKey(a);
  const bDate = startKey(b);
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
