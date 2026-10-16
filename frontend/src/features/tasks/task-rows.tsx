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
 * The Task trees of one Section of a sortable list: `sectionId` says which, null for No section.
 * A list without Sections is a single one with no `sectionId`.
 */
export type TaskSection = { sectionId?: number | null; tasks: Task[] };

/** Draws one Section: its `rows`, under its draggable-past `header` when it has one. */
export type RenderTaskSection = (
  section: TaskSection,
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
 * Task trees as sortable table rows: drag a row to reorder or nest it, or use Tab, Shift+Tab and
 * Alt+↑/↓ on a focused row. Moves stay within these trees. Where rows can't change, they are
 * plain table rows.
 */
export function SortableTaskRows({
  tasks,
  context,
}: {
  tasks: Task[];
  context: SortableRowContext;
}) {
  const sections = useMemo(() => [{ tasks }], [tasks]);
  return <SortableTaskSections sections={sections} context={context} />;
}

/**
 * A Project's Sections of Task trees as one sortable list: a row dragged past a Section's header
 * moves into that Section. Tab, Shift+Tab and Alt+↑/↓ keep a row in its Section. Where rows
 * can't change, they are plain table rows.
 */
export function SortableTaskSections({
  sections,
  renderSection,
  context,
}: {
  sections: TaskSection[];
  /** Draws each Section around its rows; without it, the rows are all there is. */
  renderSection?: RenderTaskSection;
  context: SortableRowContext;
}) {
  const { collapsed, onMove } = context;
  const outline = useMemo(
    () =>
      sections.map(({ sectionId, tasks }) => ({
        id: `section-${String(sectionId ?? "none")}`,
        rows: treeRows(tasks, collapsed),
      })),
    [sections, collapsed],
  );
  // A Task that ends up at the top level takes the Section; a Subtask follows its root.
  const moveInto = useCallback(
    (taskId: number, placement: Placement, section: TaskSection | undefined) => {
      onMove(taskId, placement, placement.parentId === null ? section?.sectionId : undefined);
    },
    [onMove],
  );
  const moveByKey = useCallback<MoveByKey>(
    (taskId, move) => {
      const section = sections.find(({ tasks }) => tasks.some((task) => task.id === taskId));
      const tasks = section?.tasks ?? [];
      const placement = keyPlacement(tasks, taskId, move);
      if (!placement) return;
      const parent = tasks.find((task) => task.id === placement.parentId);
      const height = treeRows(tasks).find((row) => row.task.id === taskId)?.height ?? 0;
      if (parent && parent.depth + 1 + height > MAX_DEPTH) {
        toast.error(TOO_DEEP);
        return;
      }
      moveInto(taskId, placement, section);
    },
    [sections, moveInto],
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
      const section = sections[index];
      return section && renderSection ? renderSection(section, header, rows) : rows;
    },
    [sections, renderSection],
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
        moveInto(taskId, placement, sections[index]);
      }}
    />
  );
}
