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
import type { MoveByKey } from "./row-drag";
import { TaskRow, TreeRows, type RowContext } from "./task-row";
import { MAX_DEPTH, treeRows } from "./task-tree";
import type { Task } from "./tasks";

/** What sortable rows need on top of every row's context. */
export type SortableRowContext = RowContext & {
  /** On touch screens a long press drags the row, so rows have no grip. */
  touch: boolean;
  /** False where the rows can't change, as in an archived Project. */
  sortable: boolean;
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
 * Shift+Tab and Alt+↑/↓ on a focused row. Moves stay within the group's trees. Where rows can't
 * change, they are plain table rows.
 */
export function SortableTaskRows({
  tasks,
  context,
}: {
  tasks: Task[];
  context: SortableRowContext;
}) {
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
    ({ row, level, handle }: SortableRowProps) => (
      <TaskRow
        task={row.task}
        level={level}
        subtasks={row.subtasks}
        selected={row.task.id === context.openId}
        collapsed={context.collapsed.has(row.task.id)}
        indent={context.indent}
        contextMenu={context.contextMenu}
        touch={context.touch}
        onToggle={context.onToggle}
        onOpen={context.onOpen}
        onToggleCollapsed={context.onToggleCollapsed}
        onMoveByKey={moveByKey}
        onKeyDown={context.onKeyDown}
        handle={handle}
      />
    ),
    [context, moveByKey],
  );
  if (!context.sortable) return <TreeRows rows={rows} context={context} />;
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
