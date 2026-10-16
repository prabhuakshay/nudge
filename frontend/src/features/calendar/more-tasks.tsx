import { useState } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Task } from "@/features/tasks/tasks";

import { CalendarTask } from "./calendar-task";
import { dayLabel, dayName } from "./day-label";

/**
 * The "+N more" button under a Month cell too full to list every Task, and the panel it opens
 * with all of that day's Tasks. Opening one closes the panel so its detail has the screen.
 */
export function MoreTasks({
  day,
  tasks,
  hidden,
  tabbable,
  onOpen,
  onToggle,
}: {
  day: string;
  /** Every Task of the day, the ones the cell shows included. */
  tasks: readonly Task[];
  /** How many of them the cell leaves out. */
  hidden: number;
  /** Whether Tab reaches the button; only the focused day's controls are in the Tab order. */
  tabbable: boolean;
  onOpen: (taskId: number) => void;
  onToggle: (task: Task) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        tabIndex={tabbable ? 0 : -1}
        aria-label={`+${String(hidden)} more on ${dayName(day)}`}
        className="self-start rounded-sm px-1 text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
      >
        +{hidden} more
      </PopoverTrigger>
      <PopoverContent aria-label={dayLabel(day)} className="w-64 gap-2 p-2">
        <p aria-hidden className="px-1 text-sm font-semibold">
          {dayName(day)}
        </p>
        <ul className="flex flex-col gap-0.5">
          {tasks.map((task) => (
            <CalendarTask
              key={task.id}
              task={task}
              tabbable
              onOpen={(taskId) => {
                setOpen(false);
                onOpen(taskId);
              }}
              onToggle={onToggle}
            />
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
