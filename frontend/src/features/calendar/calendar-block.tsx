import { useQuery } from "@tanstack/react-query";

import { HUE } from "@/features/projects/project-style";
import { findProject } from "@/features/projects/projects";
import { plainMentions } from "@/features/people/mentions";
import { TaskCheckbox } from "@/features/tasks/task-checkbox";
import { isClosed } from "@/features/tasks/task-properties";
import { sidebarQuery, type Task } from "@/features/tasks/tasks";
import { cn } from "@/lib/utils";

import { clockTime, percent, type Block } from "./layout";
import { taskLabel } from "./task-label";

/**
 * A timed Task as Week and Day mode draw it: a block in its Project's colour, placed inside the
 * hour slot it starts in and as tall as its span, overflowing into the slots below. Overlapping
 * blocks take their share of the width. Like the Month chip it ticks in place, opens on click,
 * and shows Closed and Overdue the same way.
 */
export function CalendarBlock({
  block,
  tabbable,
  onOpen,
  onToggle,
}: {
  block: Block<Task>;
  /** Whether Tab reaches it; only the focused day's Tasks are in the Tab order. */
  tabbable: boolean;
  onOpen: (taskId: number) => void;
  onToggle: (task: Task) => void;
}) {
  const { task, span, column, columns } = block;
  const { data: sidebar } = useQuery(sidebarQuery);
  const project = sidebar && findProject(sidebar, task.project_id);
  const closed = isClosed(task.status);
  const tabIndex = tabbable ? 0 : -1;

  return (
    <li
      className="absolute z-10 p-px"
      style={{
        top: percent((span.start % 60) / 60),
        height: percent((span.end - span.start) / 60),
        left: percent(column / columns),
        width: percent(1 / columns),
      }}
    >
      <div
        className={cn(
          "flex h-full min-h-5 min-w-0 items-start gap-1 overflow-hidden rounded-md py-0.5 pr-1 pl-0.5 text-xs",
          project ? HUE[project.color].soft : "bg-surface-muted",
          closed && "opacity-60",
        )}
      >
        <span
          aria-hidden
          className={cn("w-0.5 self-stretch rounded-full", project && HUE[project.color].bg)}
        />
        <TaskCheckbox
          task={task}
          tabIndex={tabIndex}
          className="mt-px size-3.5 rounded-[4px] border-[1.5px]"
          onToggle={() => {
            onToggle(task);
          }}
        />
        <button
          type="button"
          data-task-id={task.id}
          tabIndex={tabIndex}
          aria-label={taskLabel(task, project?.name)}
          onClick={() => {
            onOpen(task.id);
          }}
          className="min-w-0 flex-1 self-stretch overflow-hidden rounded-sm text-left focus-visible:outline-2 focus-visible:outline-ring"
        >
          {task.parent_title !== null && (
            <span className="block truncate text-[0.625rem] leading-tight text-muted-foreground">
              {plainMentions(task.parent_title)}
            </span>
          )}
          <span
            className={cn(
              "block truncate leading-snug font-medium text-foreground",
              closed && "text-muted-foreground line-through",
              task.is_overdue && "text-warning",
            )}
          >
            {plainMentions(task.title)}
          </span>
          <span className="block truncate text-[0.625rem] leading-tight text-muted-foreground tabular-nums">
            {clockTime(span.start)} – {clockTime(span.end)}
          </span>
        </button>
      </div>
    </li>
  );
}
