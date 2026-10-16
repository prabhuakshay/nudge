import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { CalendarRange, ChevronLeft, ChevronRight, ListChecks } from "lucide-react";
import { useEffect, useReducer, useState } from "react";

import { Button } from "@/components/ui/button";
import { QuickAddDialog } from "@/features/tasks/global-quick-add";
import { useOpenTask } from "@/features/tasks/open-task";
import { wallClock } from "@/features/tasks/schedule";
import { useSetTaskStatus } from "@/features/tasks/set-status";
import { TaskDetail } from "@/features/tasks/task-detail";
import { isClosed } from "@/features/tasks/task-properties";
import type { SidebarProject } from "@/features/tasks/tasks";

import { calendarQuery, useCalendarPlace, usePhone, type CalendarMode } from "./calendar";
import { CalendarDrag } from "./calendar-drag";
import { dayLabel } from "./day-label";
import { DayTasks } from "./day-tasks";
import { monthWeeks, shiftDays, shiftMonths, tasksOn, weekDays } from "./layout";
import { MonthGrid } from "./month-grid";
import { futureOccurrences } from "./occurrences";
import { useShowClosed } from "./show-closed";
import { slotView, type Slot } from "./slot";
import type { TaskActions } from "./task-card";
import { TimeGrid } from "./time-grid";

/** The heading of a week: the month it falls in, or both months when it spans two. */
function weekTitle(date: string): string {
  const week = weekDays(date);
  const first = parseISO(week[0] ?? date);
  const last = parseISO(week[6] ?? date);
  if (first.getMonth() === last.getMonth()) return format(first, "MMMM yyyy");
  const firstFormat = first.getFullYear() === last.getFullYear() ? "MMMM" : "MMMM yyyy";
  return `${format(first, firstFormat)} – ${format(last, "MMMM yyyy")}`;
}

/**
 * What each mode shows around a date: its name, the days it draws (whole weeks of the month, the
 * week, or the day itself), the date one step away (back when `by` is -1) and its heading.
 */
const BY_MODE: Record<
  CalendarMode,
  {
    name: string;
    days: (date: string) => string[];
    step: (date: string, by: 1 | -1) => string;
    title: (date: string) => string;
  }
> = {
  month: {
    name: "Month",
    days: (date) => monthWeeks(date).flat(),
    step: shiftMonths,
    title: (date) => format(parseISO(date), "MMMM yyyy"),
  },
  week: {
    name: "Week",
    days: weekDays,
    step: (date, by) => shiftDays(date, 7 * by),
    title: weekTitle,
  },
  day: { name: "Day", days: (date) => [date], step: shiftDays, title: (date) => dayLabel(date) },
};

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
 * Task opens its detail; ticking it closes it in place. Clicking an empty day or hour opens Quick
 * add with its date and time. Repeating Tasks also show faded on the days they come back on.
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
  const { mode, date, modes, go } = useCalendarPlace(today);
  const phone = usePhone();
  const days = BY_MODE[mode].days(date);
  const { data } = useQuery(calendarQuery({ start: days[0] ?? date, end: days.at(-1) ?? date }));
  const [showClosed, setShowClosed] = useShowClosed();
  const shown = (data?.items ?? []).filter((task) => showClosed || !isClosed(task.status));
  const tasks = data ? [...shown, ...futureOccurrences(data)] : shown;
  const { openTaskId, setOpenTask } = useOpenTask();
  const [adding, setAdding] = useState<Slot | null>(null);
  const { mutate: setStatus } = useSetTaskStatus();
  const actions: TaskActions = {
    onOpen: setOpenTask,
    onToggle: (task) => {
      setStatus({ task, status: isClosed(task.status) ? "open" : "completed" });
    },
  };
  const moveFocus = (day: string) => {
    go(day, { replace: true });
  };

  return (
    // `data-wide` lets the app shell drop its reading width for the grid.
    <div data-wide className="mx-auto w-full max-w-6xl">
      <header className="mb-4 flex flex-wrap items-center gap-2.5 sm:flex-nowrap sm:gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-hue-teal-soft text-hue-teal">
          <CalendarRange className="size-5" aria-hidden />
        </span>
        <h1 className="min-w-0 truncate text-2xl font-extrabold tracking-tight sm:text-3xl">
          {BY_MODE[mode].title(date)}
        </h1>
        {/* On a phone the controls take a row of their own below the title. */}
        <div className="flex w-full shrink-0 items-center gap-1 sm:ml-auto sm:w-auto">
          <div
            role="group"
            aria-label="Mode"
            className="mr-auto flex rounded-lg bg-surface-muted p-0.5 sm:mr-1"
          >
            {modes.map((each) => (
              <Button
                key={each}
                variant="ghost"
                aria-pressed={each === mode}
                className="h-8 px-2.5 aria-pressed:bg-surface aria-pressed:shadow-sm"
                onClick={() => {
                  go(date, { mode: each });
                }}
              >
                {BY_MODE[each].name}
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
              go(BY_MODE[mode].step(date, -1));
            }}
          >
            <ChevronLeft aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Next ${mode}`}
            onClick={() => {
              go(BY_MODE[mode].step(date, 1));
            }}
          >
            <ChevronRight aria-hidden />
          </Button>
        </div>
      </header>

      <CalendarDrag tasks={shown}>
        {mode === "month" ? (
          <>
            <MonthGrid
              date={date}
              today={today}
              tasks={tasks}
              compact={phone}
              onDateChange={moveFocus}
              onAdd={setAdding}
              actions={actions}
            />
            {phone && <DayTasks day={date} tasks={tasksOn(tasks, date)} actions={actions} />}
          </>
        ) : (
          <TimeGrid
            days={days}
            date={date}
            today={today}
            now={now.getHours() * 60 + now.getMinutes()}
            tasks={tasks}
            onDateChange={moveFocus}
            onAdd={setAdding}
            actions={actions}
          />
        )}
      </CalendarDrag>

      {adding && (
        <QuickAddDialog
          view={slotView(adding)}
          onClose={() => {
            setAdding(null);
          }}
        />
      )}

      <TaskDetail
        taskId={openTaskId}
        project={inbox}
        order={shown.map((task) => task.id)}
        onOpen={setOpenTask}
        onClose={() => {
          setOpenTask(null);
        }}
      />
    </div>
  );
}
