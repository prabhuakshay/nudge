import { useDroppable } from "@dnd-kit/core";
import { format, parseISO } from "date-fns";
import { useEffect, useRef, type KeyboardEvent } from "react";

import type { Task } from "@/features/tasks/tasks";
import { plural } from "@/features/trash/trash";
import { cn } from "@/lib/utils";

import { DraggableTask } from "./calendar-drag";
import { monthWeeks, shiftDays, tasksOn } from "./layout";
import { MoreTasks } from "./more-tasks";
import { addsToSlot, type Slot } from "./slot";

/** The most Tasks a Month cell lists before the rest go behind "+N more". */
const CELL_TASKS = 3;

/** The most dots a compact Month cell shows for its Tasks. */
const CELL_DOTS = 3;

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
 * goes into the focused day's Tasks. `date` is the focused day; `onDateChange` moves it. Clicking
 * a day, or Enter on it, calls `onAdd` to add a Task there.
 * A `compact` grid, for phones, marks each day's Tasks with dots instead, and tapping a day
 * selects it so its Tasks can be listed below; tapping the selected day adds a Task there.
 */
export function MonthGrid({
  date,
  today,
  tasks,
  compact,
  onDateChange,
  onAdd,
  onOpen,
  onToggle,
}: {
  date: string;
  today: string;
  tasks: readonly Task[];
  compact: boolean;
  onDateChange: (date: string) => void;
  onAdd: (slot: Slot) => void;
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
              compact={compact}
              tasks={tasksOn(tasks, day)}
              onKeyDown={onKeyDown}
              onSelect={onDateChange}
              onAdd={onAdd}
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
  compact,
  tasks,
  onKeyDown,
  onSelect,
  onAdd,
  onOpen,
  onToggle,
}: {
  day: string;
  isToday: boolean;
  inMonth: boolean;
  /** The day the arrow keys move from; it alone is in the Tab order. In a compact grid, it is
   * also the selected day. */
  focused: boolean;
  compact: boolean;
  tasks: Task[];
  onKeyDown: (event: KeyboardEvent<HTMLElement>, day: string) => void;
  onSelect: (day: string) => void;
  onAdd: (slot: Slot) => void;
  onOpen: (taskId: number) => void;
  onToggle: (task: Task) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: day });
  return (
    <div
      ref={setNodeRef}
      role="gridcell"
      data-day={day}
      tabIndex={focused ? 0 : -1}
      // The compact grid only draws dots, so its label says how many Tasks they stand for.
      aria-label={dayLabel(day, isToday, compact ? tasks.length : 0)}
      aria-current={isToday ? "date" : undefined}
      onKeyDown={(event) => {
        if (addsToSlot(event)) onAdd({ day, time: null });
        else onKeyDown(event, day);
      }}
      onClick={(event) => {
        if (!addsToSlot(event)) return;
        // A phone's first tap on a day selects it, to list its Tasks below the grid.
        if (compact && !focused) onSelect(day);
        else onAdd({ day, time: null });
      }}
      aria-selected={compact ? focused : undefined}
      className={cn(
        "flex min-w-0 flex-col gap-1 border-r border-border outline-none last:border-r-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
        compact ? "min-h-12 items-center py-1.5" : "min-h-24 p-1 sm:min-h-28",
        !inMonth && "bg-surface-muted/50",
        isOver && "bg-primary-soft",
      )}
    >
      <DayNumber
        day={day}
        inMonth={inMonth}
        isToday={isToday}
        compact={compact}
        selected={compact && focused}
      />
      {compact ? (
        <TaskDots count={tasks.length} />
      ) : (
        <CellTasks day={day} tasks={tasks} tabbable={focused} onOpen={onOpen} onToggle={onToggle} />
      )}
    </div>
  );
}

/** The day of the month in a cell's corner, or centred in a compact cell, today's filled in. */
function DayNumber({
  day,
  inMonth,
  isToday,
  compact,
  selected,
}: {
  day: string;
  inMonth: boolean;
  isToday: boolean;
  compact: boolean;
  selected: boolean;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-6 items-center justify-center rounded-full text-xs font-semibold tabular-nums",
        compact ? "self-center" : "self-end sm:self-start",
        inMonth ? "text-foreground" : "text-muted-foreground",
        selected && "bg-primary-soft text-primary",
        isToday && "bg-primary text-primary-foreground",
      )}
    >
      {Number(day.slice(8))}
    </span>
  );
}

/** "Thursday 15 October 2026, today, 2 Tasks", leaving out what doesn't apply. */
function dayLabel(day: string, isToday: boolean, taskCount: number): string {
  return [
    format(parseISO(day), "EEEE d MMMM yyyy"),
    isToday && "today",
    taskCount > 0 && plural(taskCount, "Task"),
  ]
    .filter(Boolean)
    .join(", ");
}

/** A full-size cell's Tasks: the first `CELL_TASKS` as chips, then "+N more" for the rest. */
function CellTasks({
  day,
  tasks,
  tabbable,
  onOpen,
  onToggle,
}: {
  day: string;
  tasks: Task[];
  tabbable: boolean;
  onOpen: (taskId: number) => void;
  onToggle: (task: Task) => void;
}) {
  return (
    <>
      {tasks.length > 0 && (
        <ul className="flex min-w-0 flex-col gap-0.5">
          {tasks.slice(0, CELL_TASKS).map((task) => (
            <DraggableTask
              key={task.id}
              task={task}
              day={day}
              tabbable={tabbable}
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
          tabbable={tabbable}
          onOpen={onOpen}
          onToggle={onToggle}
        />
      )}
    </>
  );
}

/** A compact cell's sign that the day has Tasks: a dot for each, up to `CELL_DOTS`. */
function TaskDots({ count }: { count: number }) {
  return (
    <span aria-hidden className="flex gap-0.5">
      {Array.from({ length: Math.min(count, CELL_DOTS) }, (_, index) => (
        <span key={index} className="size-1 rounded-full bg-primary" />
      ))}
    </span>
  );
}
