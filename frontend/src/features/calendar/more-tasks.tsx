import { useState } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import { CalendarTask } from "./calendar-task";
import { dayLabel, dayName } from "./day-label";
import type { CalendarItem } from "./occurrences";
import type { CardProps } from "./task-card";

/**
 * The "+N more" button under a Month cell too full to list every Task, and the panel it opens
 * with all of that day's Tasks. Opening one closes the panel so its detail has the screen.
 */
export function MoreTasks({
  day,
  tasks,
  hidden,
  card,
}: {
  day: string;
  /** Every Task of the day, the ones the cell shows included. */
  tasks: readonly CalendarItem[];
  /** How many of them the cell leaves out. */
  hidden: number;
  /** The day's chips' actions, and whether Tab reaches the button. */
  card: CardProps;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        tabIndex={card.tabbable ? 0 : -1}
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
              card={{
                tabbable: true,
                onOpen: (taskId) => {
                  setOpen(false);
                  card.onOpen(taskId);
                },
                onToggle: card.onToggle,
              }}
            />
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
