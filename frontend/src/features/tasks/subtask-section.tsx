import { ChevronRight, Plus } from "lucide-react";
import { useState } from "react";

import { Kbd } from "@/components/ui/kbd";
import { MentionText } from "@/features/people/mention-text";
import { cn } from "@/lib/utils";

import { SubtaskCount } from "./subtask-count";
import { TaskCheckbox } from "./task-checkbox";
import { isClosed } from "./task-properties";
import { MAX_DEPTH, treeRows, type TreeRow } from "./task-tree";
import { useCreateSubtask } from "./task-placement";
import { useSetTaskStatus, type TaskDetail } from "./tasks";

/** How far each level of Subtasks steps in inside the drawer, in pixels. */
const INDENT = 22;

/**
 * The drawer's Subtasks: every Subtask below the Task as an indented outline with its own
 * progress, then a field to add one more. The fourth level can't hold Subtasks, so it says so
 * instead.
 */
export function SubtaskSection({
  task,
  onOpen,
}: {
  task: TaskDetail;
  onOpen: (taskId: number) => void;
}) {
  const rows = treeRows(task.subtasks);
  const direct = rows.filter((row) => row.level === 0);
  const done = direct.filter((row) => isClosed(row.task.status)).length;

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
          <ul className="divide-y divide-border/70">
            {rows.map((row) => (
              <SubtaskItem key={row.task.id} row={row} onOpen={onOpen} />
            ))}
          </ul>
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

function SubtaskItem({ row, onOpen }: { row: TreeRow; onOpen: (taskId: number) => void }) {
  const { task, level, subtasks } = row;
  const { mutate: setStatus } = useSetTaskStatus();
  return (
    <li
      className="flex min-h-11 items-center gap-2.5 pr-2 sm:min-h-10"
      style={{ paddingLeft: 12 + level * INDENT }}
    >
      <TaskCheckbox
        task={task}
        onToggle={() => {
          setStatus({ task, status: isClosed(task.status) ? "open" : "completed" });
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
    </li>
  );
}

/** A one-line field that adds a Subtask last under the Task and stays ready for the next. */
function AddSubtask({ parentId, bordered }: { parentId: number; bordered: boolean }) {
  const [title, setTitle] = useState("");
  const { mutate: create } = useCreateSubtask(parentId);
  const add = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    create(trimmed);
    setTitle("");
  };
  return (
    <div
      className={cn(
        "flex min-h-11 items-center gap-2 px-3 sm:min-h-10",
        bordered && "border-t border-border/70",
      )}
    >
      <Plus className="size-4 shrink-0 text-primary" aria-hidden />
      <input
        aria-label="Add a subtask"
        value={title}
        autoComplete="off"
        maxLength={500}
        placeholder="Add a subtask"
        onChange={(event) => {
          setTitle(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.nativeEvent.isComposing) {
            event.preventDefault();
            add();
          } else if (event.key === "Escape" && title) {
            // Clear the field first; a second Escape closes the drawer.
            event.stopPropagation();
            setTitle("");
          }
        }}
        // 16px on touch screens: iOS Safari zooms the page into any smaller input.
        className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground pointer-coarse:h-11 pointer-coarse:text-base"
      />
      {title.trim() && <Kbd>Enter</Kbd>}
    </div>
  );
}
