import type { TaskPriority, TaskStatus } from "./tasks";

/** Whether a Status closes a Task. Blocked work is still to be done, so it counts as open. */
export function isClosed(status: TaskStatus): boolean {
  return status === "completed" || status === "wont_do";
}

/** What setting each Status did, as a toast or the Activity tab says it. */
export const STATUS_VERB: Record<TaskStatus, string> = {
  open: "Reopened",
  blocked: "Marked Blocked",
  completed: "Completed",
  wont_do: "Marked Won't do",
};

/** Each Priority's short label for chips and cells, and its long one for menus and screen readers. */
export const PRIORITY_LABEL: Record<TaskPriority, { short: string; long: string }> = {
  0: { short: "None", long: "No priority" },
  1: { short: "P1", long: "Priority 1" },
  2: { short: "P2", long: "Priority 2" },
  3: { short: "P3", long: "Priority 3" },
  4: { short: "P4", long: "Priority 4" },
};
