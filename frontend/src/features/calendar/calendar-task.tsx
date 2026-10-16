import { useQuery } from "@tanstack/react-query";

import { HUE } from "@/features/projects/project-style";
import { findProject } from "@/features/projects/projects";
import { plainMentions } from "@/features/people/mentions";
import { shortTime } from "@/features/tasks/due";
import { TaskCheckbox } from "@/features/tasks/task-checkbox";
import { isClosed } from "@/features/tasks/task-properties";
import { sidebarQuery, type Task } from "@/features/tasks/tasks";
import { cn } from "@/lib/utils";

import { taskLabel } from "./task-label";

/**
 * A Task as the Calendar draws it on a day: a chip in its Project's colour with a checkbox that
 * ticks it in place, its time, and its parent's title above a Subtask. Clicking it opens it.
 * Closed Tasks are struck through and Overdue ones take the warning colour.
 */
export function CalendarTask({
  task,
  tabbable,
  onOpen,
  onToggle,
}: {
  task: Task;
  /** Whether Tab reaches it; only the focused day's Tasks are in the Tab order. */
  tabbable: boolean;
  onOpen: (taskId: number) => void;
  onToggle: (task: Task) => void;
}) {
  const { data: sidebar } = useQuery(sidebarQuery);
  const project = sidebar && findProject(sidebar, task.project_id);
  const closed = isClosed(task.status);
  const tabIndex = tabbable ? 0 : -1;

  return (
    <li
      className={cn(
        "flex min-w-0 items-center gap-1 rounded-md py-0.5 pr-1 pl-0.5 text-xs",
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
        className="size-3.5 rounded-[4px] border-[1.5px]"
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
        className="min-w-0 flex-1 rounded-sm text-left focus-visible:outline-2 focus-visible:outline-ring"
      >
        <ChipText task={task} closed={closed} />
      </button>
    </li>
  );
}

/** A chip's text: the parent's title above a Subtask, then the time, if any, and the title. */
function ChipText({ task, closed }: { task: Task; closed: boolean }) {
  // A range shows the time it starts.
  const time = task.start_date === null ? task.due_time : task.start_time;
  return (
    <>
      {task.parent_title !== null && (
        <span className="block truncate text-[0.625rem] leading-tight text-muted-foreground">
          {plainMentions(task.parent_title)}
        </span>
      )}
      <span
        className={cn(
          "block truncate leading-snug text-foreground",
          closed && "text-muted-foreground line-through",
          task.is_overdue && "text-warning",
        )}
      >
        {time !== null && (
          <span className="mr-1 text-muted-foreground tabular-nums">{shortTime(time)}</span>
        )}
        {plainMentions(task.title)}
      </span>
    </>
  );
}
