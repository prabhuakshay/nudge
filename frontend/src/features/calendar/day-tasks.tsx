import { format, parseISO } from "date-fns";
import { useId } from "react";

import type { Task } from "@/features/tasks/tasks";

import { DraggableTask } from "./calendar-drag";

/**
 * The selected day's Tasks, listed below the compact Month on a phone, where the grid has no room
 * for them. They can be ticked, opened, or held and dragged onto another day.
 */
export function DayTasks({
  day,
  tasks,
  onOpen,
  onToggle,
}: {
  day: string;
  /** The day's Tasks, in the order the Calendar draws them. */
  tasks: readonly Task[];
  onOpen: (taskId: number) => void;
  onToggle: (task: Task) => void;
}) {
  const heading = useId();
  return (
    <section aria-labelledby={heading} className="mt-4">
      <h2 id={heading} className="mb-2 text-sm font-semibold text-muted-foreground">
        {format(parseISO(day), "EEEE d MMMM")}
      </h2>
      {tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing planned.</p>
      ) : (
        // Roomier chips than in the grid, to be easy to tap.
        <ul className="flex flex-col gap-1 [&>li>div]:py-1.5 [&>li>div]:text-sm">
          {tasks.map((task) => (
            <DraggableTask
              key={task.id}
              task={task}
              day={day}
              tabbable
              onOpen={onOpen}
              onToggle={onToggle}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
