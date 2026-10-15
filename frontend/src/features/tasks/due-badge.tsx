import { Repeat } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { describeDates, DUE_TONE_CLASS, dueLabel, dueTone, type Dates } from "./due";
import { repeatLabel } from "./repeat";
import { isClosed } from "./task-properties";
import type { Task } from "./tasks";

/**
 * A Task's due date coloured by how soon it is, with a Repeat icon when it repeats, and the full
 * dates and Repeat in a tooltip.
 */
export function DueBadge({
  task,
  className,
}: {
  task: Dates & Pick<Task, "is_overdue" | "status" | "repeat_rule">;
  className?: string;
}) {
  if (task.due_date === null) return null;
  const now = new Date();
  const repeat = task.repeat_rule ? repeatLabel(task.repeat_rule) : null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap tabular-nums",
            isClosed(task.status) ? "text-muted-foreground" : DUE_TONE_CLASS[dueTone(task, now)],
            className,
          )}
        >
          {dueLabel(task, now)}
          {repeat && <Repeat className="size-3" role="img" aria-label={`Repeats ${repeat}`} />}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {describeDates(task)}
        {repeat && ` · ${repeat}`}
      </TooltipContent>
    </Tooltip>
  );
}
