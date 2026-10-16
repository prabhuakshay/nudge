import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { CalendarRange, ChevronLeft, ChevronRight, ListChecks } from "lucide-react";
import { useCallback, useEffect, useReducer } from "react";

import { Button } from "@/components/ui/button";
import { useOpenTask } from "@/features/tasks/open-task";
import { wallClock } from "@/features/tasks/schedule";
import { useSetTaskStatus } from "@/features/tasks/set-status";
import { TaskDetail } from "@/features/tasks/task-detail";
import { isClosed } from "@/features/tasks/task-properties";
import type { SidebarProject, Task } from "@/features/tasks/tasks";

import { calendarQuery, MODES, useCalendarPlace, type CalendarMode } from "./calendar";
import { CalendarDrag } from "./calendar-drag";
import { monthWeeks, shiftDays, shiftMonths, weekDays } from "./layout";
import { MonthGrid } from "./month-grid";
import { useShowClosed } from "./show-closed";
import { TimeGrid } from "./time-grid";

const MODE_NAMES: Record<CalendarMode, string> = { month: "Month", week: "Week", day: "Day" };

/** The days a mode shows around a date: whole weeks of its month, its week, or the day itself. */
function shownDays(mode: CalendarMode, date: string): string[] {
  switch (mode) {
    case "month":
      return monthWeeks(date).flat();
    case "week":
      return weekDays(date);
    case "day":
      return [date];
  }
}

/** The date one step away in a mode, a month, a week or a day, back when `by` is -1. */
function step(mode: CalendarMode, date: string, by: 1 | -1): string {
  switch (mode) {
    case "month":
      return shiftMonths(date, by);
    case "week":
      return shiftDays(date, 7 * by);
    case "day":
      return shiftDays(date, by);
  }
}

/** The heading: the month, the month or months a week falls in, or the day. */
function title(mode: CalendarMode, date: string): string {
  if (mode === "month") return format(parseISO(date), "MMMM yyyy");
  if (mode === "day") return format(parseISO(date), "EEEE d MMMM yyyy");
  const week = weekDays(date);
  const first = parseISO(week[0] ?? date);
  const last = parseISO(week[6] ?? date);
  if (first.getMonth() === last.getMonth()) return format(first, "MMMM yyyy");
  const firstFormat = first.getFullYear() === last.getFullYear() ? "MMMM" : "MMMM yyyy";
  return `${format(first, firstFormat)} – ${format(last, "MMMM yyyy")}`;
}

/** The user's wall clock, read again every minute so today and the current-time line keep up. */
function useWallClock(timeZone: string): Date {
  const [, tick] = useReducer((ticks: number) => ticks + 1, 0);
  useEffect(() => {
    const timer = setInterval(tick, 60_000);
    return () => {
      clearInterval(timer);
    };
  }, []);
  return wallClock(timeZone);
}

/**
 * The Calendar View: every dated Task, open and Closed, drawn on the days its dates cover. It
 * shows a month, a week or a day at a time, with controls to switch between them and to step
 * forward, back and to today. Clicking a
 * Task opens its detail; ticking it closes it in place.
 */
export function CalendarView({
  inbox,
  timeZone,
}: {
  /** The drawer's fallback Project. */
  inbox: SidebarProject;
  /** The user's zone, which says what date today is. */
  timeZone: string;
}) {
  const now = useWallClock(timeZone);
  const today = format(now, "yyyy-MM-dd");
  const { mode, date, go } = useCalendarPlace(today);
  const days = shownDays(mode, date);
  const { data } = useQuery(calendarQuery({ start: days[0] ?? date, end: days.at(-1) ?? date }));
  const [showClosed, setShowClosed] = useShowClosed();
  const tasks = (data?.items ?? []).filter((task) => showClosed || !isClosed(task.status));
  const { openTaskId, setOpenTask } = useOpenTask();
  const { mutate: setStatus } = useSetTaskStatus();
  const toggle = useCallback(
    (task: Task) => {
      setStatus({ task, status: isClosed(task.status) ? "open" : "completed" });
    },
    [setStatus],
  );
  const moveFocus = (day: string) => {
    go(day, { replace: true });
  };

  return (
    // `data-wide` lets the app shell drop its reading width for the grid.
    <div data-wide className="mx-auto w-full max-w-6xl">
      <header className="mb-4 flex items-center gap-2.5 sm:gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-hue-teal-soft text-hue-teal">
          <CalendarRange className="size-5" aria-hidden />
        </span>
        <h1 className="min-w-0 truncate text-2xl font-extrabold tracking-tight sm:text-3xl">
          {title(mode, date)}
        </h1>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <div
            role="group"
            aria-label="Mode"
            className="mr-1 flex rounded-lg bg-surface-muted p-0.5"
          >
            {MODES.map((each) => (
              <Button
                key={each}
                variant="ghost"
                aria-pressed={each === mode}
                className="h-8 px-2.5 aria-pressed:bg-surface aria-pressed:shadow-sm"
                onClick={() => {
                  go(date, { mode: each });
                }}
              >
                {MODE_NAMES[each]}
              </Button>
            ))}
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Show Closed Tasks"
            aria-pressed={showClosed}
            title="Show Closed Tasks"
            className="aria-pressed:bg-surface-muted aria-pressed:text-primary"
            onClick={() => {
              setShowClosed(!showClosed);
            }}
          >
            <ListChecks aria-hidden />
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              go(today);
            }}
          >
            Today
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Previous ${mode}`}
            onClick={() => {
              go(step(mode, date, -1));
            }}
          >
            <ChevronLeft aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Next ${mode}`}
            onClick={() => {
              go(step(mode, date, 1));
            }}
          >
            <ChevronRight aria-hidden />
          </Button>
        </div>
      </header>

      {mode === "month" ? (
        <CalendarDrag tasks={tasks}>
          <MonthGrid
            date={date}
            today={today}
            tasks={tasks}
            onDateChange={moveFocus}
            onOpen={setOpenTask}
            onToggle={toggle}
          />
        </CalendarDrag>
      ) : (
        <TimeGrid
          days={days}
          date={date}
          today={today}
          now={now.getHours() * 60 + now.getMinutes()}
          tasks={tasks}
          onDateChange={moveFocus}
          onOpen={setOpenTask}
          onToggle={toggle}
        />
      )}

      <TaskDetail
        taskId={openTaskId}
        project={inbox}
        order={tasks.map((task) => task.id)}
        onOpen={setOpenTask}
        onClose={() => {
          setOpenTask(null);
        }}
      />
    </div>
  );
}
