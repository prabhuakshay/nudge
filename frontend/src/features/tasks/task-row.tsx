import { ChevronDown, ChevronRight, CornerDownRight, Paperclip } from "lucide-react";
import { memo } from "react";

import { MentionText } from "@/features/people/mention-text";
import { plainMentions } from "@/features/people/mentions";
import { cn } from "@/lib/utils";

import { CountIcon } from "./count-icon";
import { DueBadge } from "./due-badge";
import { SubtaskCount } from "./subtask-count";
import { TaskActionsMenu, TaskContextMenu } from "./task-actions";
import { DueCell, PriorityCell, StatusCell } from "./task-cells";
import { TaskCheckbox } from "./task-checkbox";
import { PriorityFlag } from "./task-priority";
import { isClosed } from "./task-properties";
import { BlockedNote, StatusBadge } from "./task-status";
import type { TreeRow } from "./task-tree";
import type { Task } from "./tasks";

/** One grid for the header and every row, so the columns line up from `lg`. */
export const GRID = "lg:grid lg:grid-cols-[minmax(0,1fr)_7.5rem_4.75rem_8.75rem_6.5rem_2.5rem]";

/** How far a title sits from its row's edge: the chevron and checkbox with their gaps, in pixels. */
const TITLE_INSET = 54;

export type ToggleStatus = (task: Task) => void;
export type OpenTask = (taskId: number) => void;
export type ToggleCollapsed = (taskId: number) => void;

/** What every row needs from the list, bundled so rows stay memoizable. */
export type RowContext = {
  openId: number | null;
  collapsed: ReadonlySet<number>;
  indent: number;
  /** On touch screens a long press is for scrolling, so rows have no context menu. */
  touch: boolean;
  onToggle: ToggleStatus;
  onOpen: OpenTask;
  onToggleCollapsed: ToggleCollapsed;
};

/** Tree rows as table rows, each knowing whether its Subtasks are folded away. */
export function TreeRows({ rows, context }: { rows: TreeRow[]; context: RowContext }) {
  return rows.map(({ task, level, subtasks }) => (
    <TaskRow
      key={task.id}
      task={task}
      level={level}
      subtasks={subtasks}
      selected={task.id === context.openId}
      collapsed={context.collapsed.has(task.id)}
      indent={context.indent}
      touch={context.touch}
      onToggle={context.onToggle}
      onOpen={context.onOpen}
      onToggleCollapsed={context.onToggleCollapsed}
    />
  ));
}

/**
 * One Task in the table, stepped in by its level. A click anywhere on it, or Enter, opens the
 * Task; the chevron, checkbox and cell pickers keep their own action. Right-click or the ⋯ button
 * opens its actions. On phones the cells fold into a meta line under the title. Memoized so a
 * change to one row leaves the others alone.
 */
const TaskRow = memo(function TaskRow({
  task,
  level,
  subtasks,
  selected,
  collapsed,
  indent,
  touch,
  onToggle,
  onOpen,
  onToggleCollapsed,
}: {
  task: Task;
  level: number;
  subtasks: TreeRow["subtasks"];
  selected: boolean;
  collapsed: boolean;
  indent: number;
  touch: boolean;
  onToggle: ToggleStatus;
  onOpen: OpenTask;
  onToggleCollapsed: ToggleCollapsed;
}) {
  const closed = isClosed(task.status);
  const blocked = task.status === "blocked";
  return (
    <TaskContextMenu
      task={task}
      disabled={touch}
      onOpen={() => {
        onOpen(task.id);
      }}
      onToggle={() => {
        onToggle(task);
      }}
    >
      <div
        role="row"
        tabIndex={0}
        data-task-id={task.id}
        aria-level={level + 1}
        aria-expanded={subtasks.total > 0 ? !collapsed : undefined}
        aria-selected={selected}
        onClick={(event) => {
          // Clicks in a picker's menu reach the row through React's tree, not the page's.
          if (event.target instanceof Node && event.currentTarget.contains(event.target)) {
            onOpen(task.id);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && event.target === event.currentTarget) {
            event.preventDefault();
            onOpen(task.id);
          }
        }}
        className={cn(
          GRID,
          "group/row flex min-h-11 cursor-pointer flex-col justify-center gap-1 border-b border-border/60 py-1.5 pr-2 pl-3 transition-colors outline-none last:border-b-0 lg:min-h-10 lg:items-center lg:gap-0 lg:py-0",
          "focus-visible:bg-primary-soft/50 focus-visible:shadow-[inset_2px_0_0_var(--primary)]",
          selected
            ? "bg-primary-soft/50 shadow-[inset_2px_0_0_var(--primary)]"
            : "hover:bg-surface-muted/60",
        )}
      >
        <div
          role="gridcell"
          className="flex min-w-0 items-center gap-2.5"
          style={{ paddingLeft: level * indent }}
        >
          <span className="-mr-1 flex w-5 shrink-0 justify-center">
            {subtasks.total > 0 && (
              <CollapseToggle
                title={plainMentions(task.title)}
                collapsed={collapsed}
                onToggle={() => {
                  onToggleCollapsed(task.id);
                }}
              />
            )}
          </span>
          <TaskCheckbox
            task={task}
            onToggle={() => {
              onToggle(task);
            }}
          />
          <div className="flex min-w-0 flex-1 flex-col">
            <span
              data-task-title
              className={cn(
                "min-w-0 truncate text-sm",
                closed && "text-muted-foreground line-through",
                !closed && (level === 0 ? "font-semibold" : "font-medium"),
              )}
            >
              <MentionText text={task.title} />
            </span>
            {level === 0 && task.parent_title !== null && (
              <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                <CornerDownRight className="size-3 shrink-0" aria-hidden />
                <span className="sr-only">Subtask of</span>
                <span className="truncate">{plainMentions(task.parent_title)}</span>
              </span>
            )}
            {blocked && <BlockedNote task={task} className="hidden lg:flex" />}
          </div>
          <TaskActionsMenu task={task} className="-my-2 lg:hidden" />
        </div>

        <PhoneMeta task={task} subtasks={subtasks} inset={TITLE_INSET + level * indent} />

        <div role="gridcell" className="hidden min-w-0 lg:block">
          <StatusCell task={task} />
        </div>
        <div role="gridcell" className="hidden min-w-0 lg:block">
          <PriorityCell task={task} />
        </div>
        <div role="gridcell" className="hidden min-w-0 lg:block">
          <DueCell task={task} />
        </div>
        <div role="gridcell" className="hidden min-w-0 items-center justify-end gap-2 pr-1 lg:flex">
          <ActivityCounts task={task} subtasks={subtasks} />
        </div>
        {/* Its own column, shown on hover or focus, so it never covers a cell. */}
        <div
          role="gridcell"
          className="hidden items-center justify-center opacity-0 transition-opacity group-focus-within/row:opacity-100 group-hover/row:opacity-100 has-[[data-state=open]]:opacity-100 lg:flex"
        >
          <TaskActionsMenu task={task} />
        </div>
      </div>
    </TaskContextMenu>
  );
});

/** The chevron that folds a Task's Subtasks away in the list, or shows them again. */
function CollapseToggle({
  title,
  collapsed,
  onToggle,
}: {
  title: string;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const Chevron = collapsed ? ChevronRight : ChevronDown;
  return (
    <button
      type="button"
      aria-label={`${collapsed ? "Expand" : "Collapse"} subtasks of “${title}”`}
      aria-expanded={!collapsed}
      onClick={(event) => {
        // The row behind it opens the Task; the chevron only folds it.
        event.stopPropagation();
        onToggle();
      }}
      className="relative flex size-5 items-center justify-center rounded text-muted-foreground after:absolute after:-inset-2 after:content-[''] hover:bg-surface-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
    >
      <Chevron className="size-4" aria-hidden />
    </button>
  );
}

/** The phone row's second line, under the title: what the table's cells show from `lg`. */
function PhoneMeta({
  task,
  subtasks,
  inset,
}: {
  task: Task;
  subtasks: TreeRow["subtasks"];
  inset: number;
}) {
  return (
    <div
      className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 empty:hidden lg:hidden"
      style={{ paddingLeft: inset }}
    >
      {task.status === "wont_do" && <StatusBadge status={task.status} />}
      {task.status === "blocked" && <BlockedNote task={task} className="max-w-full" />}
      <PriorityFlag priority={task.priority} />
      <DueBadge task={task} />
      <ActivityCounts task={task} subtasks={subtasks} />
    </div>
  );
}

/** The Activity column: the Subtask ring and the Attachment count. */
function ActivityCounts({ task, subtasks }: { task: Task; subtasks: TreeRow["subtasks"] }) {
  return (
    <>
      <SubtaskCount {...subtasks} />
      <CountIcon icon={Paperclip} count={task.attachment_count} label="attachments" />
    </>
  );
}
