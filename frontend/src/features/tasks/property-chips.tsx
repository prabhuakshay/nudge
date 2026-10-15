import { ChevronDown, Flag } from "lucide-react";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

import { PriorityMenu } from "./task-priority";
import { PRIORITY, STATUS } from "./task-properties";
import { StatusMenu } from "./task-status";
import type { Task } from "./tasks";

function Chip({ className, ...props }: ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        className,
      )}
      {...props}
    />
  );
}

/** The drawer's row of property chips under the title, each coloured by its value and opening its picker. */
export function PropertyChips({ task }: { task: Task }) {
  const status = STATUS[task.status];
  const StatusIcon = status.icon;
  const priority = PRIORITY[task.priority];
  const priorityLabel = priority.long;

  return (
    <div className="mt-4 flex flex-wrap items-center gap-1.5 sm:pl-9">
      <StatusMenu task={task}>
        <Chip
          aria-label={`Status: ${status.label}`}
          className={cn("border-transparent hover:brightness-95", status.soft, status.text)}
        >
          <StatusIcon className="size-3.5" aria-hidden />
          {status.label}
          <ChevronDown className="size-3 opacity-60" aria-hidden />
        </Chip>
      </StatusMenu>

      <PriorityMenu task={task}>
        <Chip
          aria-label={`Priority: ${priorityLabel}`}
          className={
            task.priority > 0
              ? cn("border-transparent", priority.soft, priority.text)
              : "border-dashed border-border text-muted-foreground hover:bg-surface-muted"
          }
        >
          <Flag className={cn("size-3.5", task.priority > 0 && "fill-current")} aria-hidden />
          {task.priority > 0 ? priorityLabel : "Priority"}
        </Chip>
      </PriorityMenu>
    </div>
  );
}
