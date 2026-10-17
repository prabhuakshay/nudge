import { ChevronRight, GripVertical } from "lucide-react";
import { useCallback, useMemo } from "react";

import { MentionText } from "@/features/people/mention-text";
import { plainMentions } from "@/features/people/mentions";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

import { AddSubtask } from "./add-subtask";
import { SortableTree, type DragHandle, type SortableRowProps } from "./sortable-tree";
import { SubtaskCount } from "./subtask-count";
import { TaskCheckbox } from "./task-checkbox";
import type { Placement } from "./task-drag";
import { isClosed } from "./task-properties";
import { MAX_DEPTH, treeRows, type SubtaskProgress } from "./task-tree";
import { useMoveTask } from "./task-placement";
import type { Task, TaskDetail } from "./tasks";
import { useToggleComplete } from "./use-task-verbs";

/** How far each level of Subtasks steps in inside the drawer, in pixels. */
const INDENT = 22;

/**
 * The drawer's Subtasks: every Subtask below the Task as an indented outline with its own
 * progress, then a field to add one more. Dragging a Subtask reorders and nests it under the same
 * rules as the list. The fourth level can't hold Subtasks, so it says so instead.
 */
export function SubtaskSection({
  task,
  readOnly = false,
  onOpen,
}: {
  task: TaskDetail;
  /** An archived Project's Subtasks don't move. */
  readOnly?: boolean;
  onOpen: (taskId: number) => void;
}) {
  const rows = useMemo(() => treeRows(task.subtasks), [task.subtasks]);
  const groups = useMemo(() => [{ id: "subtasks", rows }], [rows]);
  const direct = rows.filter((row) => row.level === 0);
  const done = direct.filter((row) => isClosed(row.task.status)).length;
  const base = useMemo(
    () => ({ parentId: task.id, maxLevel: MAX_DEPTH - task.depth - 1 }),
    [task.id, task.depth],
  );
  const touch = useMediaQuery("(pointer: coarse)");
  const { mutate: move } = useMoveTask();
  const onMove = useCallback(
    (taskId: number, placement: Placement) => {
      move({ taskId, ...placement });
    },
    [move],
  );
  // Stable between drag steps, so Subtasks that don't move skip rendering.
  const renderRow = useCallback(
    ({ row, level, handle }: SortableRowProps) => (
      <SubtaskItem
        task={row.task}
        level={level}
        subtasks={row.subtasks}
        handle={handle}
        touch={touch}
        onOpen={onOpen}
      />
    ),
    [touch, onOpen],
  );

  return (
    <section aria-labelledby="task-subtasks" className="mt-6">
      <div className="mb-2 flex items-center gap-2">
        <h3
          id="task-subtasks"
          className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase"
        >
          Subtasks
        </h3>
        <SubtaskCount done={done} total={direct.length} />
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        {rows.length > 0 && (
          <div role="list" className="divide-y divide-border/70">
            <SortableTree
              groups={groups}
              base={base}
              indent={INDENT}
              renderRow={renderRow}
              onMove={onMove}
              disabled={readOnly}
            />
          </div>
        )}
        {task.depth < MAX_DEPTH ? (
          <AddSubtask parentId={task.id} bordered={rows.length > 0} />
        ) : (
          <p className="px-3 py-2.5 text-xs text-muted-foreground">
            This is the fourth level, so it can't have Subtasks.
          </p>
        )}
      </div>
    </section>
  );
}

/**
 * One Subtask in the drawer. It drags like a list row: the whole item with a mouse or a press and
 * hold, or its grip with the keyboard; phones get no grip.
 */
function SubtaskItem({
  task,
  level,
  subtasks,
  handle: { setNode, attributes, listeners, onPointerDown, onTouchStart },
  touch,
  onOpen,
}: {
  task: Task;
  level: number;
  subtasks: SubtaskProgress;
  handle: DragHandle;
  touch: boolean;
  onOpen: (taskId: number) => void;
}) {
  const toggleComplete = useToggleComplete();
  return (
    <div
      role="listitem"
      ref={touch ? setNode : undefined}
      onTouchStart={touch ? onTouchStart : undefined}
      onPointerDown={touch ? undefined : onPointerDown}
      // No text selection or iOS callout, so a long press starts a drag instead.
      className="group/subtask relative flex min-h-11 items-center gap-2.5 bg-surface pr-2 select-none [-webkit-touch-callout:none] sm:min-h-10"
      style={{ paddingLeft: 12 + level * INDENT }}
    >
      {!touch && (
        <button
          type="button"
          ref={setNode}
          {...attributes}
          {...listeners}
          aria-label={`Drag “${plainMentions(task.title)}”`}
          style={{ left: level * INDENT }}
          className="absolute top-1/2 flex h-6 w-3 -translate-y-1/2 cursor-grab touch-none items-center justify-center text-muted-foreground/60 opacity-0 group-focus-within/subtask:opacity-100 group-hover/subtask:opacity-100 hover:text-foreground focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-ring active:cursor-grabbing"
        >
          <GripVertical className="size-3.5 shrink-0" aria-hidden />
        </button>
      )}
      <TaskCheckbox
        task={task}
        onToggle={() => {
          toggleComplete(task);
        }}
      />
      <button
        type="button"
        data-task-title
        onClick={() => {
          onOpen(task.id);
        }}
        className={cn(
          "min-w-0 flex-1 truncate rounded py-1 text-left text-sm hover:text-primary focus-visible:outline-2 focus-visible:outline-ring",
          isClosed(task.status) && "text-muted-foreground line-through",
        )}
      >
        <MentionText text={task.title} />
      </button>
      {task.status === "blocked" && (
        <span className="rounded bg-warning-soft px-1.5 py-px text-[10px] font-bold text-warning">
          Blocked
        </span>
      )}
      <SubtaskCount {...subtasks} />
      <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60" aria-hidden />
    </div>
  );
}
