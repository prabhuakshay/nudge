import { isClosed } from "./task-properties";
import type { Task } from "./tasks";

/** The deepest a Task can sit: a root is at 0, so Tasks nest four levels in all. */
export const MAX_DEPTH = 3;

/** How many of a Task's direct Subtasks there are, and how many of those are Closed. */
export type SubtaskProgress = { done: number; total: number };

/** A Task placed in its tree: how far below the top it sits and what's directly under it. */
export type TreeRow = { task: Task; level: number; subtasks: SubtaskProgress };

/**
 * The server sends flat rows in manual order within each sibling set, so grouping them by parent
 * keeps every set in order.
 */
function childrenByParent(rows: Task[]) {
  const children = new Map<number | null, Task[]>();
  for (const row of rows) {
    const siblings = children.get(row.parent_id);
    if (siblings) siblings.push(row);
    else children.set(row.parent_id, [row]);
  }
  return children;
}

/** The rows that start a tree: those whose parent isn't among the rows. */
function rootsOf(rows: Task[]) {
  const ids = new Set(rows.map((row) => row.id));
  return rows.filter((row) => row.parent_id === null || !ids.has(row.parent_id));
}

/**
 * Flat rows as an outline: each root followed by its Subtasks, depth first, leaving out the
 * Subtasks of collapsed Tasks.
 */
export function treeRows(rows: Task[], collapsed: ReadonlySet<number> = new Set()): TreeRow[] {
  const children = childrenByParent(rows);
  const outline: TreeRow[] = [];
  const walk = (task: Task, level: number) => {
    const kids = children.get(task.id) ?? [];
    const done = kids.filter((kid) => isClosed(kid.status)).length;
    outline.push({ task, level, subtasks: { done, total: kids.length } });
    if (collapsed.has(task.id)) return;
    for (const kid of kids) walk(kid, level + 1);
  };
  for (const root of rootsOf(rows)) walk(root, 0);
  return outline;
}

/** The ids of the Tasks that have Subtasks among the rows, which Collapse all folds. */
export function parentsOf(rows: Task[]): number[] {
  const parents = new Set(rows.map((row) => row.parent_id));
  return rows.filter((row) => parents.has(row.id)).map((row) => row.id);
}

/** The rows of the trees whose root passes the test, in the order given. */
export function treesWhere(rows: Task[], test: (root: Task) => boolean): Task[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const rootOf = (row: Task): Task => {
    const parent = row.parent_id === null ? undefined : byId.get(row.parent_id);
    return parent ? rootOf(parent) : row;
  };
  return rows.filter((row) => test(rootOf(row)));
}

/** The rows of the trees whose root is still open, as an open list shows them. */
export function openTrees(rows: Task[]): Task[] {
  return treesWhere(rows, (root) => !isClosed(root.status));
}
