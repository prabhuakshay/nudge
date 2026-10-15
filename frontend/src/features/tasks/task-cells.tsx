import { CalendarDays, Flag, type LucideIcon } from "lucide-react";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

import { DatePicker } from "./date-picker";
import { dueName } from "./due";
import { DueBadge } from "./due-badge";
import { PriorityBadge, PriorityMenu } from "./task-priority";
import { PRIORITY, STATUS } from "./task-properties";
import { StatusBadge, StatusMenu } from "./task-status";
import type { Task } from "./tasks";

/** A table cell that is a button opening its picker. Flat until hovered. */
function CellButton({ className, onClick, onKeyDown, ...props }: ComponentProps<"button">) {
  return (
    <button
      type="button"
      // The row opens the Task on click and handles its own keys; the cell keeps both to itself,
      // while still passing them to the picker that wraps it.
      onClick={(event) => {
        event.stopPropagation();
        onClick?.(event);
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        onKeyDown?.(event);
      }}
      className={cn(
        "flex h-8 w-full min-w-0 items-center gap-1 rounded-md px-2 text-left transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring data-[state=open]:bg-surface-muted",
        className,
      )}
      {...props}
    />
  );
}

/** What an empty cell offers: hidden until the row is hovered or focused, so empty rows stay calm. */
function Placeholder({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground opacity-0 transition-opacity group-focus-within/row:opacity-70 group-hover/row:opacity-70">
      <Icon className="size-3.5" aria-hidden />
      {label}
    </span>
  );
}

/** The list's Status cell, which opens the Status picker. */
export function StatusCell({ task }: { task: Task }) {
  return (
    <StatusMenu task={task}>
      <CellButton aria-label={`Status: ${STATUS[task.status].label}`}>
        <StatusBadge status={task.status} />
      </CellButton>
    </StatusMenu>
  );
}

/** The list's Priority cell, which opens the Priority picker. */
export function PriorityCell({ task }: { task: Task }) {
  return (
    <PriorityMenu task={task}>
      <CellButton aria-label={`Priority: ${PRIORITY[task.priority].long}`}>
        {task.priority > 0 ? (
          <PriorityBadge priority={task.priority} />
        ) : (
          <Placeholder icon={Flag} label="Set" />
        )}
      </CellButton>
    </PriorityMenu>
  );
}

/** The list's Due cell, which opens the date picker. */
export function DueCell({ task }: { task: Task }) {
  return (
    <DatePicker task={task}>
      <CellButton aria-label={`Due: ${dueName(task, new Date())}`}>
        {task.due_date === null ? (
          <Placeholder icon={CalendarDays} label="Add date" />
        ) : (
          <DueBadge task={task} />
        )}
      </CellButton>
    </DatePicker>
  );
}
