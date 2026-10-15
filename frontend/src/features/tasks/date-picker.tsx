import { addDays, format, nextMonday, parseISO } from "date-fns";
import {
  CalendarArrowUp,
  CalendarRange,
  CalendarX,
  Clock,
  Sun,
  Sunrise,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import { changeDates, shortTime, type Dates } from "./due";
import { useUpdateTask } from "./tasks";

const TIMES = Array.from(
  { length: 48 },
  (_, i) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`,
);

/** Native fields, so phones show their own pickers. 16 px stops iOS zooming into them. */
const FIELD =
  "h-9 rounded-md border border-border bg-surface px-2 text-base text-foreground focus-visible:border-primary focus-visible:outline-none disabled:opacity-50 sm:h-8 sm:text-sm";

const isoDate = (day: Date) => format(day, "yyyy-MM-dd");

/**
 * A Task's dates in one popover, like TickTick's: quick days, a calendar for the due date, its
 * time (none = all-day) and an optional start for ranges. Each change saves straight away. The
 * trigger is `children`, so the Due cell and the drawer's Date chip style it their own way.
 */
export function DatePicker({
  task,
  children,
  align = "start",
}: {
  task: Dates & { id: number };
  children: ReactNode;
  align?: "start" | "center" | "end";
}) {
  const [open, setOpen] = useState(false);
  const { mutate: update } = useUpdateTask();
  const save = (change: Partial<Dates>) => {
    const next = changeDates(task, change);
    update({
      id: task.id,
      dates: next.due_date === null ? null : { ...next, due_date: next.due_date },
    });
  };
  const today = new Date();
  const due = task.due_date === null ? undefined : parseISO(task.due_date);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align={align}
        aria-label="Date"
        className="w-[19rem] p-0"
        // The picker sits inside a clickable row in the list; its clicks mustn't open the Task.
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <QuickDays dates={task} today={today} onChange={save} />
        <Calendar
          mode="single"
          selected={due}
          defaultMonth={due ?? today}
          onSelect={(day: Date | undefined) => {
            if (day) save({ due_date: isoDate(day) });
          }}
          className="mx-auto"
        />
        <TimeFields dates={task} onChange={save} />
        <div className="flex justify-end border-t border-border p-2">
          <Button
            variant="ghost"
            onClick={() => {
              setOpen(false);
            }}
          >
            Close
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

type DatesFieldProps = { dates: Dates; onChange: (change: Partial<Dates>) => void };

/** One-tap due dates, as in TickTick. */
function QuickDays({ dates, today, onChange }: DatesFieldProps & { today: Date }) {
  const quick: { label: string; icon: LucideIcon; date: string | null; className: string }[] = [
    { label: "Today", icon: Sun, date: isoDate(today), className: "text-success" },
    { label: "Tomorrow", icon: Sunrise, date: isoDate(addDays(today, 1)), className: "text-p2" },
    {
      label: "Next week",
      icon: CalendarArrowUp,
      date: isoDate(nextMonday(today)),
      className: "text-hue-violet",
    },
    { label: "No date", icon: CalendarX, date: null, className: "text-muted-foreground" },
  ];
  return (
    <div className="grid grid-cols-4 gap-1 border-b border-border p-2">
      {quick.map(({ label, icon: Icon, date, className }) => (
        <button
          key={label}
          type="button"
          onClick={() => {
            onChange({ due_date: date });
          }}
          className={cn(
            "flex flex-col items-center gap-1 rounded-md py-2 text-[11px] font-medium hover:bg-surface-muted",
            dates.due_date === date && "bg-primary-soft",
          )}
        >
          <Icon className={cn("size-4", className)} aria-hidden />
          {label}
        </button>
      ))}
    </div>
  );
}

/** The due time and the start of a range; both wait for a due date. */
function TimeFields({ dates, onChange }: DatesFieldProps) {
  const undated = dates.due_date === null;
  return (
    <div className="space-y-1 border-t border-border p-2">
      <Row icon={Clock} label="Time">
        <select
          aria-label="Due time"
          value={dates.due_time === null ? "" : shortTime(dates.due_time)}
          disabled={undated}
          onChange={(event) => {
            onChange({ due_time: event.target.value || null });
          }}
          className={FIELD}
        >
          <option value="">All day</option>
          <TimeOptions saved={dates.due_time} />
        </select>
      </Row>
      <Row icon={CalendarRange} label="Start" hint={undated ? "Needs a due date" : "For a range"}>
        <div className="flex gap-1">
          <input
            type="date"
            aria-label="Start date"
            value={dates.start_date ?? ""}
            max={dates.due_date ?? undefined}
            disabled={undated}
            onChange={(event) => {
              onChange({ start_date: event.target.value || null });
            }}
            className={cn(FIELD, "w-36")}
          />
          {dates.start_date !== null && dates.due_time !== null && (
            <select
              aria-label="Start time"
              value={dates.start_time === null ? "" : shortTime(dates.start_time)}
              onChange={(event) => {
                onChange({ start_time: event.target.value });
              }}
              className={cn(FIELD, "w-20")}
            >
              <TimeOptions saved={dates.start_time} />
            </select>
          )}
        </div>
      </Row>
    </div>
  );
}

/** Every half hour, plus the saved time when it falls between them. */
function TimeOptions({ saved }: { saved: string | null }) {
  const time = saved === null ? null : shortTime(saved);
  const times = time !== null && !TIMES.includes(time) ? [...TIMES, time].sort() : TIMES;
  return times.map((option) => (
    <option key={option} value={option}>
      {option}
    </option>
  ));
}

function Row({
  icon: Icon,
  label,
  hint,
  children,
}: {
  icon: LucideIcon;
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-9 items-center gap-2 px-1">
      <Icon className="size-4 text-muted-foreground" aria-hidden />
      <span className="flex-1 text-sm">
        {label}
        {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
      </span>
      {children}
    </div>
  );
}
