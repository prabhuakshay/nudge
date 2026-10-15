import { ChevronDown, ChevronRight, GripVertical, Paperclip } from "lucide-react";
import { memo, type KeyboardEvent } from "react";

import { cn } from "@/lib/utils";

import { CountIcon } from "./count-icon";
import { DueBadge } from "./due-badge";
import type { DragHandle } from "./sortable-tree";
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
/** A move from the keyboard: Tab, Shift+Tab, Alt+↑ and Alt+↓. */
export type KeyMove = "indent" | "outdent" | "up" | "down";
export type MoveByKey = (taskId: number, move: KeyMove) => void;

/**
 * One Task in the table, stepped in by its level. A click anywhere on it, or Enter, opens the
 * Task; the chevron, checkbox and cell pickers keep their own action. Right-click or the ⋯ button
 * opens its actions. On phones the cells fold into a meta line under the title. The whole row
 * drags: after a 5 px move with a mouse, after a press and hold on touch, or from its grip with
 * the keyboard. Memoized so a change to one row leaves the others alone.
 */
export const TaskRow = memo(function TaskRow({
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
  onMoveByKey,
  handle,
  dragging,
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
  onMoveByKey: MoveByKey;
  handle: DragHandle;
  dragging: boolean;
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
          if (event.target !== event.currentTarget) return;
          const move = keyMove(event);
          if (move) onMoveByKey(task.id, move);
          else if (event.key === "Enter") onOpen(task.id);
          else return;
          event.preventDefault();
        }}
        {...rowActivator(handle, touch)}
        className={cn(
          GRID,
          // No text selection or iOS callout, so a long press starts a drag instead.
          "select-none [-webkit-touch-callout:none]",
          "group/row flex min-h-11 cursor-pointer flex-col justify-center gap-1 border-b border-border/60 py-1.5 pr-2 pl-3 transition-colors outline-none lg:min-h-10 lg:items-center lg:gap-0 lg:py-0 [:last-child>&]:border-b-0",
          "focus-visible:bg-primary-soft/50 focus-visible:shadow-[inset_2px_0_0_var(--primary)]",
          selected
            ? "bg-primary-soft/50 shadow-[inset_2px_0_0_var(--primary)]"
            : "hover:bg-surface-muted/60",
          dragging && "opacity-40",
        )}
      >
        <div
          role="gridcell"
          className="relative flex min-w-0 items-center gap-2.5"
          style={{ paddingLeft: level * indent }}
        >
          {!touch && <Grip title={task.title} handle={handle} left={level * indent - 12} />}
          <span className="-mr-1 flex w-5 shrink-0 justify-center">
            {subtasks.total > 0 && (
              <CollapseToggle
                title={task.title}
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
              {task.title}
            </span>
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

/**
 * Touch screens drag the whole row after a press and hold; mice after a 5 px move. The grip
 * carries the keyboard drag.
 */
function rowActivator(handle: DragHandle, touch: boolean) {
  return touch
    ? { ref: handle.setNode, onTouchStart: handle.onTouchStart }
    : { onPointerDown: handle.onPointerDown };
}

function keyMove(event: KeyboardEvent): KeyMove | null {
  if (event.key === "Tab") return event.shiftKey ? "outdent" : "indent";
  if (event.altKey && event.key === "ArrowUp") return "up";
  if (event.altKey && event.key === "ArrowDown") return "down";
  return null;
}

/**
 * The drag handle at a row's left edge, shown on hover or focus from `lg`. Phones have none: a
 * press and hold drags the whole row. Space or Enter on it starts a keyboard drag.
 */
function Grip({
  title,
  handle: { setNode, attributes, listeners },
  left,
}: {
  title: string;
  handle: DragHandle;
  left: number;
}) {
  return (
    <button
      type="button"
      ref={setNode}
      {...attributes}
      {...listeners}
      aria-label={`Drag “${title}”`}
      onClick={(event) => {
        // The row behind it opens the Task; the grip only drags.
        event.stopPropagation();
      }}
      style={{ left }}
      className="absolute top-1/2 hidden h-6 w-3.5 -translate-y-1/2 cursor-grab touch-none items-center justify-center rounded text-muted-foreground/60 opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100 hover:text-foreground focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-ring active:cursor-grabbing lg:flex"
    >
      <GripVertical className="size-3.5 shrink-0" aria-hidden />
    </button>
  );
}

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
