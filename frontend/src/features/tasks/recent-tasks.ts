/**
 * The Tasks this browser opened last, for the command bar's Recent group. Kept in localStorage:
 * it's a convenience, so a browser that can't store it just shows no Recent Tasks.
 */

const KEY = "nudge.recent-tasks";
const LIMIT = 5;

/** What the command bar needs to list and open a recent Task without loading it. */
export type RecentTask = { id: number; title: string; project_id: number };

function isRecentTask(value: unknown): value is RecentTask {
  if (typeof value !== "object" || value === null) return false;
  // Any non-null object can be read field by field; the checks below say what each field is.
  const { id, title, project_id: projectId } = value as Record<string, unknown>;
  return typeof id === "number" && typeof title === "string" && typeof projectId === "number";
}

/** The last Tasks opened, newest first. */
export function recentTasks(): RecentTask[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(stored) ? stored.filter(isRecentTask) : [];
  } catch {
    return [];
  }
}

/** Remember a Task as the one opened last. */
export function rememberTask({ id, title, project_id: projectId }: RecentTask): void {
  const recent = [
    { id, title, project_id: projectId },
    ...recentTasks().filter((task) => task.id !== id),
  ];
  try {
    localStorage.setItem(KEY, JSON.stringify(recent.slice(0, LIMIT)));
  } catch {
    // Storage is full or blocked; the command bar just has no Recent Tasks.
  }
}
