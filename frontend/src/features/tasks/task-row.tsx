import { Paperclip } from "lucide-react";
import { memo } from "react";

import { TagBadge } from "@/features/tags/tag-badge";
import { cn } from "@/lib/utils";

import { CountIcon } from "./count-icon";
import { DueBadge } from "./due-badge";
import { DueCell, PriorityCell, StatusCell, TagsCell } from "./task-cells";
import { TaskCheckbox } from "./task-checkbox";
import { PriorityFlag } from "./task-priority";
import { isClosed } from "./task-properties";
import { BlockedNote, StatusBadge } from "./task-status";
import type { Task } from "./tasks";

/** One grid for the header and every row, so the columns line up from `lg`. */
export const GRID =
  "lg:grid lg:grid-cols-[minmax(0,1fr)_7.5rem_4.75rem_8.75rem_6.5rem] xl:grid-cols-[minmax(0,1fr)_7.5rem_4.75rem_8.75rem_11rem_6.5rem]";

export type ToggleStatus = (task: Task) => void;
export type OpenTask = (taskId: number) => void;

/**
 * One Task in the table. A click anywhere on it, or Enter, opens the Task; the checkbox and the
 * cell pickers keep their own action. On phones the cells fold into a meta line under the title.
 * Memoized so a change to one row leaves the others alone.
 */
export const TaskRow = memo(function TaskRow({
  task,
  selected,
  onToggle,
  onOpen,
}: {
  task: Task;
  selected: boolean;
  onToggle: ToggleStatus;
  onOpen: OpenTask;
}) {
  const closed = isClosed(task.status);
  const blocked = task.status === "blocked";
  const firstTag = task.tags[0];
  return (
    <div
      role="row"
      tabIndex={0}
      data-task-id={task.id}
      aria-level={1}
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
      <div role="gridcell" className="flex min-w-0 items-center gap-2.5">
        <TaskCheckbox
          task={task}
          onToggle={() => {
            onToggle(task);
          }}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="flex min-w-0 items-center gap-2">
            <span
              data-task-title
              className={cn(
                "min-w-0 truncate text-sm",
                closed ? "text-muted-foreground line-through" : "font-semibold",
              )}
            >
              {task.title}
            </span>
            {/* The first Tag sits in the title cell while the Tags column is hidden. */}
            {firstTag && <TagBadge tag={firstTag} className="hidden shrink-0 lg:flex xl:hidden" />}
          </span>
          {blocked && <BlockedNote task={task} className="hidden lg:flex" />}
        </div>
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 pl-7 empty:hidden lg:hidden">
        {task.status === "wont_do" && <StatusBadge status={task.status} />}
        {blocked && <BlockedNote task={task} className="max-w-full" />}
        <PriorityFlag priority={task.priority} />
        <DueBadge task={task} />
        {task.tags.map((tag) => (
          <TagBadge key={tag.id} tag={tag} />
        ))}
        <ActivityCounts task={task} />
      </div>

      <div role="gridcell" className="hidden min-w-0 lg:block">
        <StatusCell task={task} />
      </div>
      <div role="gridcell" className="hidden min-w-0 lg:block">
        <PriorityCell task={task} />
      </div>
      <div role="gridcell" className="hidden min-w-0 lg:block">
        <DueCell task={task} />
      </div>
      <div role="gridcell" className="hidden min-w-0 overflow-hidden xl:block">
        <TagsCell task={task} />
      </div>
      <div role="gridcell" className="hidden min-w-0 items-center justify-end gap-2 pr-1 lg:flex">
        <ActivityCounts task={task} />
      </div>
    </div>
  );
});

function ActivityCounts({ task }: { task: Task }) {
  return <CountIcon icon={Paperclip} count={task.attachment_count} label="attachments" />;
}
