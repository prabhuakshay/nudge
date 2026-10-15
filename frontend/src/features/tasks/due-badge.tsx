import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { describeDates, DUE_TONE_CLASS, dueLabel, dueTone, type Dates } from "./due";
import { isClosed } from "./task-properties";
import type { Task } from "./tasks";

/** A Task's due date coloured by how soon it is, with the full dates in a tooltip. */
export function DueBadge({
  task,
  className,
}: {
  task: Dates & Pick<Task, "is_overdue" | "status">;
  className?: string;
}) {
  if (task.due_date === null) return null;
  const now = new Date();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex items-center text-xs font-medium whitespace-nowrap tabular-nums",
            isClosed(task.status) ? "text-muted-foreground" : DUE_TONE_CLASS[dueTone(task, now)],
            className,
          )}
        >
          {dueLabel(task, now)}
        </span>
      </TooltipTrigger>
      <TooltipContent>{describeDates(task)}</TooltipContent>
    </Tooltip>
  );
}
