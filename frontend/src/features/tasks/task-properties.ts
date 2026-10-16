import { Ban, CircleDashed, CircleDot, CircleSlash, type LucideIcon } from "lucide-react";

import type { TaskPriority, TaskStatus } from "./tasks";

/** Whether a Status closes a Task. Blocked work is still to be done, so it counts as open. */
export function isClosed(status: TaskStatus): boolean {
  return status === "completed" || status === "wont_do";
}

/** The Statuses in the order pickers list them: the open ones, then the Closed ones. */
export const STATUSES: readonly TaskStatus[] = ["open", "blocked", "completed", "wont_do"];

/** The Priorities in the order pickers list them, most urgent first, as TickTick does. */
export const PRIORITIES: readonly TaskPriority[] = [1, 2, 3, 4, 0];

/** How each Status looks: its name, icon, and text and background colours. */
export const STATUS: Record<
  TaskStatus,
  { label: string; icon: LucideIcon; text: string; soft: string }
> = {
  open: {
    label: "Open",
    icon: CircleDashed,
    text: "text-muted-foreground",
    soft: "bg-surface-muted",
  },
  blocked: { label: "Blocked", icon: Ban, text: "text-warning", soft: "bg-warning-soft" },
  completed: { label: "Completed", icon: CircleDot, text: "text-success", soft: "bg-success-soft" },
  wont_do: {
    label: "Won't do",
    icon: CircleSlash,
    text: "text-muted-foreground",
    soft: "bg-surface-muted",
  },
};

/** What setting each Status did, as a toast or the Activity tab says it. */
export const STATUS_VERB: Record<TaskStatus, string> = {
  open: "Reopened",
  blocked: "Marked Blocked",
  completed: "Completed",
  wont_do: "Marked Won't do",
};

/**
 * How each Priority looks: a short label for chips and cells, a long one for menus and screen
 * readers, and its text, soft background and checkbox ring colours.
 */
export const PRIORITY: Record<
  TaskPriority,
  { short: string; long: string; text: string; soft: string; border: string }
> = {
  0: {
    short: "None",
    long: "No priority",
    text: "text-muted-foreground",
    soft: "bg-surface-muted",
    border: "border-muted-foreground/45",
  },
  1: { short: "P1", long: "Priority 1", text: "text-p1", soft: "bg-p1-soft", border: "border-p1" },
  2: { short: "P2", long: "Priority 2", text: "text-p2", soft: "bg-p2-soft", border: "border-p2" },
  3: { short: "P3", long: "Priority 3", text: "text-p3", soft: "bg-p3-soft", border: "border-p3" },
  4: { short: "P4", long: "Priority 4", text: "text-p4", soft: "bg-p4-soft", border: "border-p4" },
};

/** What a Status change did, counting the relatives it closed or reopened along with the Task. */
export function statusMessage(title: string, status: TaskStatus, relatives: number): string {
  const message = `${STATUS_VERB[status]} “${title}”`;
  if (relatives < 1) return message;
  if (isClosed(status)) {
    return `${message} with ${String(relatives)} ${relatives === 1 ? "Subtask" : "Subtasks"}`;
  }
  return `${message} and ${relatives === 1 ? "its parent" : `${String(relatives)} parents`}`;
}
