import { useDroppable } from "@dnd-kit/core";
import { format, parseISO } from "date-fns";
import {
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent,
  type MouseEvent,
} from "react";

import type { Task } from "@/features/tasks/tasks";
import { cn } from "@/lib/utils";

import { DraggableBlock, DraggableTask } from "./calendar-drag";
import { dayLabel } from "./day-label";
import { useFocusLater } from "./grid-focus";
import {
  allDayTasks,
  clockTime,
  dayBlocks,
  percent,
  shiftDays,
  slotTarget,
  type Block,
  type Row,
} from "./layout";
import { addsToSlot, type Slot } from "./slot";

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

/** The hour the timeline opens scrolled to, and the slot the keyboard starts from. */
const FIRST_HOUR = 8;

function hourLabel(hour: number) {
  return clockTime(hour * 60);
}

function slotLabel(day: string, today: string, row: Row) {
  return `${dayLabel(day, day === today)}, ${row === "all-day" ? "all day" : hourLabel(row)}`;
}

/**
 * Week and Day mode: one column per day with hours down the side and an all-day strip on top.
 * Every slot is a grid cell; the arrow keys move between them, Left and Right by a day (past the
 * edge into the next or previous week) and Up and Down by an hour. Tab goes into the focused
 * day's Tasks. `date` is the focused day; `onDateChange` moves it. Clicking a slot, or Enter on
 * it, calls `onAdd` to add a Task at its day and hour.
 */
export function TimeGrid({
  days,
  date,
  today,
  now,
  tasks,
  onDateChange,
  onAdd,
  onOpen,
  onToggle,
}: {
  /** The days shown, one column each. */
  days: readonly string[];
  date: string;
  today: string;
  /** The minutes since midnight on the user's clock, where today's current-time line goes. */
  now: number;
  tasks: readonly Task[];
  onDateChange: (date: string) => void;
  onAdd: (slot: Slot) => void;
  onOpen: (taskId: number) => void;
  onToggle: (task: Task) => void;
}) {
  const [row, setRow] = useState<Row>(FIRST_HOUR);
  const { grid, focusLater } = useFocusLater();
  const timeline = useRef<HTMLDivElement>(null);
  const first = days[0] ?? date;
  const blocks = new Map(days.map((day) => [day, dayBlocks(tasks, day)]));
  const blocksAt = (day: string, hour: number) =>
    (blocks.get(day) ?? []).filter((block) => Math.floor(block.span.start / 60) === hour);
  const columns = { gridTemplateColumns: `3.5rem repeat(${days.length}, minmax(0, 1fr))` };

  useEffect(() => {
    const first = timeline.current?.querySelector<HTMLElement>(`[data-hour="${FIRST_HOUR}"]`);
    if (timeline.current && first) timeline.current.scrollTop = first.offsetTop;
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLElement>, day: string) => {
    // Keys pressed on a Task inside the slot belong to the Task.
    if (event.target !== event.currentTarget) return;
    const next = nextSlot(event.key, day, row);
    if (next === null) return;
    event.preventDefault();
    focusLater(`[data-day="${next.day}"][data-hour="${String(next.row)}"]`);
    setRow(next.row);
    if (next.day !== day) onDateChange(next.day);
  };

  const add = (day: string, slotRow: Row) => {
    onAdd({ day, time: slotRow === "all-day" ? null : hourLabel(slotRow) });
  };
  const slot = (day: string, slotRow: Row) => ({
    day,
    row: slotRow,
    "data-day": day,
    "data-hour": String(slotRow),
    tabIndex: day === date && slotRow === row ? 0 : -1,
    "aria-label": slotLabel(day, today, slotRow),
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (addsToSlot(event)) add(day, slotRow);
      else onKeyDown(event, day);
    },
    onClick: (event: MouseEvent<HTMLElement>) => {
      if (addsToSlot(event)) add(day, slotRow);
    },
  });
  const slotClass =
    "relative min-w-0 border-l border-border outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring";

  return (
    <div
      ref={grid}
      role="grid"
      aria-label={`${days.length === 1 ? "" : "Week of "}${dayLabel(first, first === today)}`}
      className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-sm"
    >
      <div
        role="rowgroup"
        className="[scrollbar-gutter:stable] overflow-y-hidden border-b border-border"
      >
        <div role="row" className="grid" style={columns}>
          <span aria-hidden />
          {days.map((day) => (
            <div
              key={day}
              role="columnheader"
              aria-current={day === today ? "date" : undefined}
              className="flex items-center justify-center gap-1 py-2 text-xs font-semibold text-muted-foreground"
            >
              {format(parseISO(day), "EEE")}{" "}
              <span
                className={cn(
                  "flex size-6 items-center justify-center rounded-full tabular-nums",
                  day === today ? "bg-primary text-primary-foreground" : "text-foreground",
                )}
              >
                {format(parseISO(day), "d")}
              </span>
            </div>
          ))}
        </div>
        <div role="row" className="grid border-t border-border" style={columns}>
          <span
            role="rowheader"
            className="self-center pr-2 text-right text-[0.625rem] text-muted-foreground"
          >
            All day
          </span>
          {days.map((day) => {
            const strip = allDayTasks(tasks, day);
            return (
              <DropSlot
                key={day}
                {...slot(day, "all-day")}
                className={cn(slotClass, "min-h-8 p-0.5")}
              >
                {strip.length > 0 && (
                  <ul className="flex min-w-0 flex-col gap-0.5">
                    {strip.map((task) => (
                      <DraggableTask
                        key={task.id}
                        task={task}
                        day={day}
                        tabbable={day === date}
                        onOpen={onOpen}
                        onToggle={onToggle}
                      />
                    ))}
                  </ul>
                )}
              </DropSlot>
            );
          })}
        </div>
      </div>
      <div
        ref={timeline}
        role="rowgroup"
        className="max-h-[calc(100dvh-14rem)] min-h-72 [scrollbar-gutter:stable] overflow-y-auto"
      >
        {HOURS.map((hour) => (
          <div key={hour} role="row" className="grid" style={columns}>
            <span
              role="rowheader"
              className={cn(
                "pr-2 text-right text-[0.625rem] text-muted-foreground tabular-nums",
                hour > 0 && "-translate-y-1/2",
              )}
            >
              {hourLabel(hour)}
            </span>
            {days.map((day) => (
              <DropSlot
                key={day}
                {...slot(day, hour)}
                className={cn(slotClass, "h-12", hour > 0 && "border-t")}
              >
                {day === today && hour === Math.floor(now / 60) && <NowLine now={now} />}
                <SlotBlocks
                  day={day}
                  blocks={blocksAt(day, hour)}
                  tabbable={day === date}
                  onOpen={onOpen}
                  onToggle={onToggle}
                />
              </DropSlot>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** A slot of the grid: a grid cell that Tasks can be dropped on, lit while one is over it. */
function DropSlot({
  day,
  row,
  className,
  ...props
}: ComponentProps<"div"> & { day: string; row: Row }) {
  const { setNodeRef, isOver } = useDroppable({ id: slotTarget(day, row) });
  return (
    <div
      ref={setNodeRef}
      role="gridcell"
      className={cn(className, isOver && "bg-primary-soft")}
      {...props}
    />
  );
}

/** The line across today's column at the current time, inside the hour slot it falls in. */
function NowLine({ now }: { now: number }) {
  return (
    <div
      role="img"
      aria-label={`Now, ${clockTime(now)}`}
      className="pointer-events-none absolute inset-x-0 z-20 h-0.5 -translate-y-1/2 bg-danger"
      style={{ top: percent((now % 60) / 60) }}
    />
  );
}

/** The blocks that start in an hour slot; each overflows down into the slots it covers. */
function SlotBlocks({
  day,
  blocks,
  tabbable,
  onOpen,
  onToggle,
}: {
  day: string;
  blocks: Block<Task>[];
  tabbable: boolean;
  onOpen: (taskId: number) => void;
  onToggle: (task: Task) => void;
}) {
  if (blocks.length === 0) return null;
  return (
    <ul>
      {blocks.map((block) => (
        <DraggableBlock
          key={block.task.id}
          block={block}
          day={day}
          tabbable={tabbable}
          onOpen={onOpen}
          onToggle={onToggle}
        />
      ))}
    </ul>
  );
}

/** Where an arrow key moves from a slot, or null for any other key. */
function nextSlot(key: string, day: string, row: Row): { day: string; row: Row } | null {
  switch (key) {
    case "ArrowLeft":
      return { day: shiftDays(day, -1), row };
    case "ArrowRight":
      return { day: shiftDays(day, 1), row };
    case "ArrowUp":
      return { day, row: row === "all-day" || row === 0 ? "all-day" : row - 1 };
    case "ArrowDown":
      return { day, row: row === "all-day" ? 0 : Math.min(row + 1, HOURS.length - 1) };
    default:
      return null;
  }
}
