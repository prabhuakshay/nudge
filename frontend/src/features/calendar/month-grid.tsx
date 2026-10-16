import { useDroppable } from "@dnd-kit/core";
import { format, parseISO } from "date-fns";
import { useEffect, useRef, type KeyboardEvent } from "react";

import type { Task } from "@/features/tasks/tasks";
import { cn } from "@/lib/utils";

import { DraggableTask } from "./calendar-drag";
import { monthWeeks, shiftDays, tasksOn } from "./layout";
import { MoreTasks } from "./more-tasks";

/** The most Tasks a Month cell lists before the rest go behind "+N more". */
const CELL_TASKS = 3;

/** How far each arrow key moves the focused day. */
const ARROW_DAYS: Partial<Record<string, number>> = {
  ArrowLeft: -1,
  ArrowRight: 1,
  ArrowUp: -7,
  ArrowDown: 7,
};

/**
 * The month around `date` as a grid of days, weeks from Monday, each day listing its Tasks. The
 * arrow keys move between days, stepping into the next or previous month past its edge, and Tab
 * goes into the focused day's Tasks. `date` is the focused day; `onDateChange` moves it.
 */
export function MonthGrid({
  date,
  today,
  tasks,
  onDateChange,
  onOpen,
  onToggle,
}: {
  date: string;
  today: string;
  tasks: readonly Task[];
  onDateChange: (date: string) => void;
  onOpen: (taskId: number) => void;
  onToggle: (task: Task) => void;
}) {
  const weeks = monthWeeks(date);
  const month = date.slice(0, 7);
  const grid = useRef<HTMLDivElement>(null);
  // The day the keyboard moved to, focused once it is drawn: a day in another month needs the
  // address to change first.
  const pendingFocus = useRef<string | null>(null);

  useEffect(() => {
    if (pendingFocus.current === null) return;
    const cell = grid.current?.querySelector<HTMLElement>(`[data-day="${pendingFocus.current}"]`);
    if (!cell) return;
    cell.focus();
    pendingFocus.current = null;
  });

  const onKeyDown = (event: KeyboardEvent<HTMLElement>, day: string) => {
    const days = ARROW_DAYS[event.key];
    // Keys pressed on a Task inside the day belong to the Task.
    if (days === undefined || event.target !== event.currentTarget) return;
    event.preventDefault();
    const next = shiftDays(day, days);
    pendingFocus.current = next;
    onDateChange(next);
  };

  return (
    <div
      ref={grid}
      role="grid"
      aria-label={format(parseISO(date), "MMMM yyyy")}
      className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm"
    >
      <div role="row" className="grid grid-cols-7 border-b border-border">
        {weeks[0]?.map((day) => (
          <div
            key={day}
            role="columnheader"
            className="py-2 text-center text-xs font-semibold text-muted-foreground"
          >
            {format(parseISO(day), "EEE")}
          </div>
        ))}
      </div>
      {weeks.map((week) => (
        // Rows and days keep their keys across months, so the focused day survives a month change.
        <div
          key={week[0]}
          role="row"
          className="grid grid-cols-7 border-b border-border last:border-b-0"
        >
          {week.map((day) => (
            <DayCell
              key={day}
              day={day}
              isToday={day === today}
              inMonth={day.startsWith(month)}
              focused={day === date}
              tasks={tasksOn(tasks, day)}
              onKeyDown={onKeyDown}
              onOpen={onOpen}
              onToggle={onToggle}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function DayCell({
  day,
  isToday,
  inMonth,
  focused,
  tasks,
  onKeyDown,
  onOpen,
  onToggle,
}: {
  day: string;
  isToday: boolean;
  inMonth: boolean;
  /** The day the arrow keys move from; it alone is in the Tab order. */
  focused: boolean;
  tasks: Task[];
  onKeyDown: (event: KeyboardEvent<HTMLElement>, day: string) => void;
  onOpen: (taskId: number) => void;
  onToggle: (task: Task) => void;
}) {
  const label = format(parseISO(day), "EEEE d MMMM yyyy");
  const { setNodeRef, isOver } = useDroppable({ id: day });
  return (
    <div
      ref={setNodeRef}
      role="gridcell"
      data-day={day}
      tabIndex={focused ? 0 : -1}
      aria-label={isToday ? `${label}, today` : label}
      aria-current={isToday ? "date" : undefined}
      onKeyDown={(event) => {
        onKeyDown(event, day);
      }}
      className={cn(
        "flex min-h-24 min-w-0 flex-col gap-1 border-r border-border p-1 outline-none last:border-r-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sm:min-h-28",
        !inMonth && "bg-surface-muted/50",
        isOver && "bg-primary-soft",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "flex size-6 items-center justify-center self-end rounded-full text-xs font-semibold tabular-nums sm:self-start",
          inMonth ? "text-foreground" : "text-muted-foreground",
          isToday && "bg-primary text-primary-foreground",
        )}
      >
        {Number(day.slice(8))}
      </span>
      {tasks.length > 0 && (
        <ul className="flex min-w-0 flex-col gap-0.5">
          {tasks.slice(0, CELL_TASKS).map((task) => (
            <DraggableTask
              key={task.id}
              task={task}
              day={day}
              tabbable={focused}
              onOpen={onOpen}
              onToggle={onToggle}
            />
          ))}
        </ul>
      )}
      {tasks.length > CELL_TASKS && (
        <MoreTasks
          day={day}
          tasks={tasks}
          hidden={tasks.length - CELL_TASKS}
          tabbable={focused}
          onOpen={onOpen}
          onToggle={onToggle}
        />
      )}
    </div>
  );
}
