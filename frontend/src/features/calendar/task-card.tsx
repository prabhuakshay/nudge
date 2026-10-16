import { useQuery } from "@tanstack/react-query";
import { Repeat } from "lucide-react";

import { HUE } from "@/features/projects/project-style";
import { findProject } from "@/features/projects/projects";
import { plainMentions } from "@/features/people/mentions";
import { TaskCheckbox } from "@/features/tasks/task-checkbox";
import { isClosed, PRIORITY } from "@/features/tasks/task-properties";
import { sidebarQuery, type Task } from "@/features/tasks/tasks";
import { cn } from "@/lib/utils";

import type { CalendarItem } from "./occurrences";
import { taskLabel } from "./task-label";

/** What a card needs besides its Task: whether Tab reaches it, and what opening and ticking do. */
export type CardProps = {
  /** Whether Tab reaches it; only the focused day's Tasks are in the Tab order. */
  tabbable: boolean;
  onOpen: (taskId: number) => void;
  onToggle: (task: Task) => void;
};

/**
 * A Month or all-day chip is one line, its time before the title; a Week or Day block fills its
 * span, its times on a line of their own under the title.
 */
const SHAPES = {
  chip: { card: "items-center", tick: "", button: "", title: "" },
  block: {
    card: "h-full min-h-5 items-start overflow-hidden",
    tick: "mt-px",
    button: "self-stretch overflow-hidden",
    title: "font-medium",
  },
};

/**
 * A Task as the Calendar draws it: a card in its Project's colour with a checkbox that ticks it in
 * place, its parent's title above a Subtask, its title and `time`. Clicking it opens it. Closed
 * Tasks are struck through and Overdue ones take the warning colour. A future Occurrence is
 * faded, with a Repeat mark where the checkbox would be.
 */
export function TaskCard({
  task,
  shape,
  time,
  tabbable,
  onOpen,
  onToggle,
}: CardProps & { task: CalendarItem; shape: keyof typeof SHAPES; time: string | null }) {
  const { data: sidebar } = useQuery(sidebarQuery);
  const project = sidebar && findProject(sidebar, task.project_id);
  const closed = isClosed(task.status);
  const tabIndex = tabbable ? 0 : -1;
  const style = SHAPES[shape];

  return (
    <div
      className={cn(
        "flex min-w-0 gap-1 rounded-md py-0.5 pr-1 pl-0.5 text-xs",
        style.card,
        project ? HUE[project.color].soft : "bg-surface-muted",
        closed && "opacity-60",
        task.occurrence && "opacity-50",
      )}
    >
      <span
        aria-hidden
        className={cn("w-0.5 self-stretch rounded-full", project && HUE[project.color].bg)}
      />
      <TickOrRepeat
        task={task}
        tabIndex={tabIndex}
        className={cn("size-3.5 rounded-[4px] border-[1.5px]", style.tick)}
        onToggle={onToggle}
      />
      <button
        type="button"
        data-task-id={task.id}
        tabIndex={tabIndex}
        aria-label={taskLabel(task, project?.name)}
        onClick={() => {
          onOpen(task.id);
        }}
        className={cn(
          "min-w-0 flex-1 rounded-sm text-left focus-visible:outline-2 focus-visible:outline-ring",
          style.button,
        )}
      >
        <CardText task={task} shape={shape} time={time} />
      </button>
    </div>
  );
}

/** A card's text: the parent's title above a Subtask, then the title and the time. */
function CardText({
  task,
  shape,
  time,
}: {
  task: CalendarItem;
  shape: keyof typeof SHAPES;
  time: string | null;
}) {
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
          SHAPES[shape].title,
          isClosed(task.status) && "text-muted-foreground line-through",
          task.is_overdue && "text-warning",
        )}
      >
        {shape === "chip" && time !== null && (
          <span className="mr-1 text-muted-foreground tabular-nums">{time}</span>
        )}
        {plainMentions(task.title)}
      </span>
      {shape === "block" && (
        <span className="block truncate text-[0.625rem] leading-tight text-muted-foreground tabular-nums">
          {time}
        </span>
      )}
    </>
  );
}

/**
 * A Task's checkbox, or for a future Occurrence, which can't be ticked yet, a Repeat mark. Either
 * takes the Priority colour, so urgent work stands out on every day it comes back.
 */
function TickOrRepeat({
  task,
  tabIndex,
  className,
  onToggle,
}: {
  task: CalendarItem;
  tabIndex: number;
  className: string;
  onToggle: (task: Task) => void;
}) {
  if (task.occurrence) {
    return (
      <Repeat aria-hidden className={cn(className, "border-0", PRIORITY[task.priority].text)} />
    );
  }
  return (
    <TaskCheckbox
      task={task}
      tabIndex={tabIndex}
      className={className}
      onToggle={() => {
        onToggle(task);
      }}
    />
  );
}
