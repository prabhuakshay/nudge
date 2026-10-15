import { useCallback, useMemo } from "react";
import { toast } from "sonner";

import { SortableTree, type SortableRowProps } from "./sortable-tree";
import {
  indentPlacement,
  nudgePlacement,
  outdentPlacement,
  TOO_DEEP,
  type Placement,
  type TreeBase,
} from "./task-drag";
import {
  TaskRow,
  type MoveByKey,
  type OpenTask,
  type ToggleCollapsed,
  type ToggleStatus,
} from "./task-row";
import { MAX_DEPTH, treeRows } from "./task-tree";
import type { Task } from "./tasks";

/** What every row needs from the list, bundled so rows stay memoizable. */
export type RowContext = {
  openId: number | null;
  collapsed: ReadonlySet<number>;
  indent: number;
  /** On touch screens a long press drags, so rows have no context menu and no grip. */
  touch: boolean;
  onToggle: ToggleStatus;
  onOpen: OpenTask;
  onToggleCollapsed: ToggleCollapsed;
  onMove: (taskId: number, placement: Placement) => void;
};

/** A Project's roots sit at the top, and may nest down to the fourth level. */
const PROJECT_TREE: TreeBase = { parentId: null, maxLevel: MAX_DEPTH };

/** Where a keyboard move puts the Task among `tasks`, or null when it can't go that way. */
function keyPlacement(tasks: Task[], taskId: number, move: Parameters<MoveByKey>[1]) {
  switch (move) {
    case "indent":
      return indentPlacement(tasks, taskId);
    case "outdent":
      return outdentPlacement(tasks, taskId, null);
    case "up":
      return nudgePlacement(tasks, taskId, -1);
    case "down":
      return nudgePlacement(tasks, taskId, 1);
  }
}

/**
 * One group of Task trees as sortable table rows: drag a row to reorder or nest it, or use Tab,
 * Shift+Tab and Alt+↑/↓ on a focused row. Moves stay within the group's trees.
 */
export function SortableTaskRows({ tasks, context }: { tasks: Task[]; context: RowContext }) {
  const rows = useMemo(() => treeRows(tasks, context.collapsed), [tasks, context.collapsed]);
  const { onMove } = context;
  const moveByKey = useCallback<MoveByKey>(
    (taskId, move) => {
      const placement = keyPlacement(tasks, taskId, move);
      if (!placement) return;
      const parent = tasks.find((task) => task.id === placement.parentId);
      const height = treeRows(tasks).find((row) => row.task.id === taskId)?.height ?? 0;
      if (parent && parent.depth + 1 + height > MAX_DEPTH) {
        toast.error(TOO_DEEP);
        return;
      }
      onMove(taskId, placement);
    },
    [tasks, onMove],
  );
  // Stable between drag steps, so rows that don't move skip rendering.
  const renderRow = useCallback(
    ({ row, level, handle, dragging }: SortableRowProps) => (
      <TaskRow
        task={row.task}
        level={level}
        subtasks={row.subtasks}
        selected={row.task.id === context.openId}
        collapsed={context.collapsed.has(row.task.id)}
        indent={context.indent}
        touch={context.touch}
        onToggle={context.onToggle}
        onOpen={context.onOpen}
        onToggleCollapsed={context.onToggleCollapsed}
        onMoveByKey={moveByKey}
        handle={handle}
        dragging={dragging}
      />
    ),
    [context, moveByKey],
  );
  return (
    <SortableTree
      rows={rows}
      base={PROJECT_TREE}
      indent={context.indent}
      renderRow={renderRow}
      onMove={onMove}
    />
  );
}
