import type { DraggableSyntheticListeners } from "@dnd-kit/core";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";

import { HUE } from "@/features/projects/project-style";
import { findProject } from "@/features/projects/projects";
import { plainMentions } from "@/features/people/mentions";
import { shortTime } from "@/features/tasks/due";
import { TaskCheckbox } from "@/features/tasks/task-checkbox";
import { isClosed, STATUS } from "@/features/tasks/task-properties";
import { sidebarQuery, type Task } from "@/features/tasks/tasks";
import { cn } from "@/lib/utils";

/** A chip's drag handle: the node dnd-kit measures, the presses that start a drag and its state. */
export type ChipDrag = {
  setNode: (node: HTMLElement | null) => void;
  listeners: DraggableSyntheticListeners;
  dragging: boolean;
};

/** A chip that can't be dragged. */
const STILL: ChipDrag = { setNode: () => undefined, listeners: undefined, dragging: false };

function when(date: string, time: string | null) {
  const day = format(parseISO(date), "EEEE d MMMM");
  return time === null ? day : `${day}, ${shortTime(time)}`;
}

/** What a screen reader hears for a Task on the Calendar: its title, dates, Project and state. */
function taskLabel(task: Task, projectName: string | undefined) {
  const dates =
    task.start_date === null
      ? when(task.due_date ?? "", task.due_time)
      : `${when(task.start_date, task.start_time)} – ${when(task.due_date ?? "", task.due_time)}`;
  return [
    plainMentions(task.title),
    task.parent_title !== null && `Subtask of ${plainMentions(task.parent_title)}`,
    dates,
    projectName !== undefined && `in ${projectName}`,
    task.status !== "open" && STATUS[task.status].label.toLowerCase(),
    task.is_overdue && "overdue",
  ]
    .filter(Boolean)
    .join(", ");
}

/**
 * A Task as the Calendar draws it on a day: a chip in its Project's colour with a checkbox that
 * ticks it in place, its time, and its parent's title above a Subtask. Clicking it opens it.
 * Closed Tasks are struck through and Overdue ones take the warning colour.
 */
export function CalendarTask({
  task,
  tabbable,
  drag: { setNode, listeners, dragging } = STILL,
  onOpen,
  onToggle,
}: {
  task: Task;
  /** Whether Tab reaches it; only the focused day's Tasks are in the Tab order. */
  tabbable: boolean;
  /** What lets the chip be dragged, from `DraggableTask`; without it the chip stays put. */
  drag?: ChipDrag;
  onOpen: (taskId: number) => void;
  onToggle: (task: Task) => void;
}) {
  const { data: sidebar } = useQuery(sidebarQuery);
  const project = sidebar && findProject(sidebar, task.project_id);
  const closed = isClosed(task.status);
  const tabIndex = tabbable ? 0 : -1;

  return (
    <li
      ref={setNode}
      {...listeners}
      className={cn(
        "flex min-w-0 items-center gap-1 rounded-md py-0.5 pr-1 pl-0.5 text-xs",
        project ? HUE[project.color].soft : "bg-surface-muted",
        closed && "opacity-60",
        dragging && "opacity-40",
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
