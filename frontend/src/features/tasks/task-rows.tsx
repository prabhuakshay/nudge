import { Fragment, useCallback, useMemo, type ReactNode } from "react";
import { toast } from "sonner";

import {
  SortableTree,
  type GroupHeader,
  type RenderGroup,
  type SortableRowProps,
} from "./sortable-tree";
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
  /** `sectionId` is the Section a top-level drop lands in, when the list has Sections. */
  onMove: (taskId: number, placement: Placement, sectionId?: number | null) => void;
};

/**
 * A run of Task trees in a sortable list. In a Project with Sections each Section is one, and
 * `sectionId` says which: null for No section.
 */
export type TaskGroup = { sectionId?: number | null; tasks: Task[] };

/** Draws one group: its `rows`, under its draggable-past `header` when it has one. */
export type RenderTaskGroup = (
  group: TaskGroup,
  header: GroupHeader | null,
  rows: ReactNode,
) => ReactNode;

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
  const groups = useMemo(() => [{ tasks }], [tasks]);
  return <SortableTaskGroups groups={groups} renderGroup={justRows} context={context} />;
}

const justRows: RenderTaskGroup = (_group, _header, rows) => rows;

/**
 * Groups of Task trees, such as a Project's Sections, as one sortable list: a row dragged past a
 * group's header moves into that group. Tab, Shift+Tab and Alt+↑/↓ keep a row in its group.
 * Where rows can't change, they are plain table rows.
 */
export function SortableTaskGroups({
  groups,
  renderGroup,
  context,
}: {
  groups: TaskGroup[];
  renderGroup: RenderTaskGroup;
  context: SortableRowContext;
}) {
  const { collapsed, onMove } = context;
  const outline = useMemo(
    () =>
      groups.map(({ sectionId, tasks }) => ({
        id: `section-${String(sectionId ?? "none")}`,
        rows: treeRows(tasks, collapsed),
      })),
    [groups, collapsed],
  );
  // A Task that ends up at the top level takes its group's Section; a Subtask follows its root.
  const moveInto = useCallback(
    (taskId: number, placement: Placement, group: TaskGroup | undefined) => {
      onMove(taskId, placement, placement.parentId === null ? group?.sectionId : undefined);
    },
    [onMove],
  );
  const moveByKey = useCallback<MoveByKey>(
    (taskId, move) => {
      const group = groups.find(({ tasks }) => tasks.some((task) => task.id === taskId));
      const tasks = group?.tasks ?? [];
      const placement = keyPlacement(tasks, taskId, move);
      if (!placement) return;
      const parent = tasks.find((task) => task.id === placement.parentId);
      const height = treeRows(tasks).find((row) => row.task.id === taskId)?.height ?? 0;
      if (parent && parent.depth + 1 + height > MAX_DEPTH) {
        toast.error(TOO_DEEP);
        return;
      }
      moveInto(taskId, placement, group);
    },
    [groups, moveInto],
  );
  // Stable between drag steps, so rows that don't move skip rendering.
  const renderRow = useCallback(
    ({ row, level, handle }: SortableRowProps) => (
      <TaskRow
        task={row.task}
        level={level}
        subtasks={row.subtasks}
        selected={row.task.id === context.openId || context.selectedIds.has(row.task.id)}
        collapsed={context.collapsed.has(row.task.id)}
        indent={context.indent}
        contextMenu={context.contextMenu}
        touch={context.touch}
        onToggle={context.onToggle}
        onOpen={context.onOpen}
        onSelect={context.onSelect}
        onToggleCollapsed={context.onToggleCollapsed}
        onMoveByKey={moveByKey}
        onKeyDown={context.onKeyDown}
        handle={handle}
      />
    ),
    [context, moveByKey],
  );
  const drawGroup = useCallback<RenderGroup>(
    (index, header, rows) => {
      const group = groups[index];
      return group && renderGroup(group, header, rows);
    },
    [groups, renderGroup],
  );
  if (!context.sortable) {
    return outline.map(({ id, rows }, index) => (
      <Fragment key={id}>
        {drawGroup(index, null, <TreeRows rows={rows} context={context} />)}
      </Fragment>
    ));
  }
  return (
    <SortableTree
      groups={outline}
      base={PROJECT_TREE}
      indent={context.indent}
      renderRow={renderRow}
      renderGroup={drawGroup}
      onMove={(taskId, placement, index) => {
        moveInto(taskId, placement, groups[index]);
      }}
    />
  );
}
