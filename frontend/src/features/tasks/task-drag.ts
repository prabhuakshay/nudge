import type { UniqueIdentifier } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";

import type { TreeRow } from "./task-tree";
import type { Task } from "./tasks";

/** Why a drop or a Tab is refused, as the server words it. */
export const TOO_DEEP = "Tasks can only nest four levels deep.";

/** Where a Task goes, as the server takes it: its parent and the sibling it follows. */
export type Placement = { parentId: number | null; afterId: number | null };

/** Where a drag would drop the Task, at which outline level, and whether the rules allow it. */
export type Drop = Placement & { level: number; valid: boolean };

/**
 * The tree an outline shows: the parent of its level-0 rows (null for a Project's roots) and the
 * deepest level a row may take before it breaks the four-level limit.
 */
export type TreeBase = { parentId: number | null; maxLevel: number };

/** The sibling before `index` at `level`, or null when the parent comes first. */
function siblingBefore(rows: TreeRow[], index: number, level: number): number | null {
  for (let at = index - 1; at >= 0; at--) {
    const row = rows[at];
    if (!row || row.level < level) return null;
    if (row.level === level) return row.task.id;
  }
  return null;
}

/** The parent a row at `level` gets when it sits at `index`: the nearest row one level up. */
function parentAt(rows: TreeRow[], index: number, level: number, base: TreeBase) {
  if (level === 0) return base.parentId;
  for (let at = index - 1; at >= 0; at--) {
    const row = rows[at];
    if (row?.level === level - 1) return row.task.id;
  }
  return base.parentId;
}

/**
 * Where the dragged row lands when over `overId` and moved `step` indent steps sideways. It may
 * nest at most one level below the row above it, and no shallower than the row below it; the
 * Subtasks it carries count against the four-level limit.
 */
export function projectDrop(
  rows: TreeRow[],
  activeId: number,
  overId: number,
  step: number,
  base: TreeBase,
): Drop | null {
  const activeIndex = rows.findIndex((row) => row.task.id === activeId);
  const overIndex = rows.findIndex((row) => row.task.id === overId);
  const active = rows[activeIndex];
  if (!active || overIndex < 0) return null;
  const moved = arrayMove(rows, activeIndex, overIndex);
  const previous = moved[overIndex - 1];
  const next = moved[overIndex + 1];
  const deepest = Math.min(previous ? previous.level + 1 : 0, base.maxLevel - active.height);
  const shallowest = next ? next.level : 0;
  const valid = deepest >= shallowest;
  const level = valid ? Math.min(Math.max(active.level + step, shallowest), deepest) : shallowest;
  return {
    level,
    parentId: parentAt(moved, overIndex, level, base),
    afterId: siblingBefore(moved, overIndex, level),
    valid,
  };
}

/**
 * One run of an outline split into groups, such as a Project's Sections. Every group after the
 * first sits under a header, sortable as `id`, that rows are dragged past to change group.
 */
export type RowGroup = { id: string; rows: TreeRow[] };

/** A sortable slot in a grouped outline: a row, or a group's header by its id. */
type Slot = TreeRow | string;

function slotId(slot: Slot): UniqueIdentifier {
  return typeof slot === "string" ? slot : slot.task.id;
}

/**
 * Where the dragged row lands in a grouped outline when over `overId`, a row or a header: in the
 * group whose header it ends up below, placed among that group's rows as `projectDrop` places it.
 */
export function groupedDrop(
  groups: RowGroup[],
  activeId: number,
  overId: UniqueIdentifier,
  step: number,
  base: TreeBase,
): (Drop & { group: number }) | null {
  const slots = groups.flatMap<Slot>(({ id, rows }, index) => (index === 0 ? rows : [id, ...rows]));
  const from = slots.findIndex((slot) => slotId(slot) === activeId);
  const to = slots.findIndex((slot) => slotId(slot) === overId);
  if (from < 0 || to < 0) return null;
  const moved = arrayMove(slots, from, to);
  const isHeader = (slot: Slot) => typeof slot === "string";
  const start = moved.findLastIndex((slot, index) => index < to && isHeader(slot)) + 1;
  const end = moved.findIndex((slot, index) => index > to && isHeader(slot));
  const rows = moved
    .slice(start, end === -1 ? undefined : end)
    .filter((slot): slot is TreeRow => typeof slot !== "string");
  const drop = projectDrop(rows, activeId, activeId, step, base);
  const group = moved.slice(0, to).filter(isHeader).length;
  return drop && { ...drop, group };
}

/** Where the Task sits now, to tell a drop that changes nothing from a move. */
export function currentPlacement(rows: TreeRow[], taskId: number, base: TreeBase): Placement {
  const index = rows.findIndex((row) => row.task.id === taskId);
  const row = rows[index];
  if (!row) return { parentId: null, afterId: null };
  return {
    parentId: row.level === 0 ? base.parentId : row.task.parent_id,
    afterId: siblingBefore(rows, index, row.level),
  };
}

function siblingsOf(tasks: Task[], taskId: number) {
  const task = tasks.find((item) => item.id === taskId);
  const siblings = task ? tasks.filter((item) => item.parent_id === task.parent_id) : [];
  return { task, siblings, index: siblings.findIndex((item) => item.id === taskId) };
}

/** Tab: the Task becomes the last Subtask of the sibling above; null when there is none. */
export function indentPlacement(tasks: Task[], taskId: number): Placement | null {
  const { siblings, index } = siblingsOf(tasks, taskId);
  const above = siblings[index - 1];
  if (!above) return null;
  const lastChild = tasks.filter((item) => item.parent_id === above.id).at(-1);
  return { parentId: above.id, afterId: lastChild?.id ?? null };
}

/** Shift+Tab: the Task leaves its parent to sit right after it; null at the outline's top. */
export function outdentPlacement(
  tasks: Task[],
  taskId: number,
  topParentId: number | null,
): Placement | null {
  const { task } = siblingsOf(tasks, taskId);
  const parent = tasks.find((item) => item.id === task?.parent_id);
  if (!parent || parent.id === topParentId) return null;
  return { parentId: parent.parent_id, afterId: parent.id };
}

/** Alt+↑/↓: the Task swaps places with the sibling above or below; null at either end. */
export function nudgePlacement(tasks: Task[], taskId: number, direction: -1 | 1): Placement | null {
  const { task, siblings, index } = siblingsOf(tasks, taskId);
  const neighbour = siblings[index + direction];
  if (!task || !neighbour) return null;
  const afterId = direction === 1 ? neighbour.id : (siblings[index - 2]?.id ?? null);
  return { parentId: task.parent_id, afterId };
}

/**
 * Flat rows with one Task moved, as the server will place it. Rows only keep their order among
 * siblings, so the Task goes right after `afterId`, first when there is none, or last when
 * `afterId` is missing. A Task that becomes a Subtask drops its pin, as on the server.
 */
export function moveRow<T extends Task>(tasks: T[], taskId: number, placement: Placement): T[] {
  const moving = tasks.find((task) => task.id === taskId);
  if (!moving) return tasks;
  const rest = tasks.filter((task) => task.id !== taskId);
  const moved: T = {
    ...moving,
    parent_id: placement.parentId,
    pinned_at: placement.parentId === null ? moving.pinned_at : null,
  };
  const after = rest.findIndex((task) => task.id === placement.afterId);
  const index = placement.afterId === null ? 0 : after === -1 ? rest.length : after + 1;
  return [...rest.slice(0, index), moved, ...rest.slice(index)];
}
