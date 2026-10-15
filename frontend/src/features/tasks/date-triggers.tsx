import { CalendarDays } from "lucide-react";

import { cn } from "@/lib/utils";

import { DatePicker } from "./date-picker";
import { dueName } from "./due";
import { DueBadge } from "./due-badge";
import type { Task } from "./tasks";

/**
 * The list's Due cell: the due date, or an "Add date" hint on hover, opening the date picker.
 * Its clicks and keys stay in the cell so they don't open the Task.
 */
export function DueCell({ task }: { task: Task }) {
  return (
    <DatePicker task={task}>
      <button
        type="button"
        aria-label={`Due: ${dueName(task, new Date())}`}
        onClick={(event) => {
          event.stopPropagation();
        }}
        onKeyDown={(event) => {
          event.stopPropagation();
        }}
        className="flex h-8 w-full min-w-0 items-center gap-1 rounded-md px-2 text-left transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:-outline-offset-2 data-[state=open]:bg-surface-muted"
      >
        {task.due_date === null ? (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground opacity-0 transition-opacity group-focus-within/row:opacity-70 group-hover/row:opacity-70">
            <CalendarDays className="size-3.5" aria-hidden />
            Add date
          </span>
        ) : (
          <DueBadge task={task} />
        )}
      </button>
    </DatePicker>
  );
}

/** The drawer's Date chip: tinted once the Task has a date, opening the date picker. */
export function DateChip({ task }: { task: Task }) {
  const dated = task.due_date !== null;
  return (
    <DatePicker task={task}>
      <button
        type="button"
        aria-label={`Date: ${dueName(task, new Date())}`}
        className={cn(
          "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold whitespace-nowrap transition-colors",
          dated
            ? "border-transparent bg-surface-muted"
            : "border-border bg-surface text-muted-foreground hover:text-foreground",
        )}
      >
        <CalendarDays className="size-3.5 text-muted-foreground" aria-hidden />
        {dated ? <DueBadge task={task} /> : "Date"}
      </button>
    </DatePicker>
  );
}
