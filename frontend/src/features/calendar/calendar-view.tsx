import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { CalendarRange, ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback } from "react";

import { Button } from "@/components/ui/button";
import { useOpenTask } from "@/features/tasks/open-task";
import { todayIn } from "@/features/tasks/schedule";
import { useSetTaskStatus } from "@/features/tasks/set-status";
import { TaskDetail } from "@/features/tasks/task-detail";
import { isClosed } from "@/features/tasks/task-properties";
import type { SidebarProject, Task } from "@/features/tasks/tasks";

import { calendarQuery, useCalendarPlace } from "./calendar";
import { CalendarDrag } from "./calendar-drag";
import { monthWeeks, shiftMonths } from "./layout";
import { MonthGrid } from "./month-grid";

/** The first and last day a Month grid shows, which is the range it asks the server for. */
function monthRange(date: string) {
  const weeks = monthWeeks(date);
  return { start: weeks[0]?.[0] ?? date, end: weeks.at(-1)?.at(-1) ?? date };
}

/**
 * The Calendar View: every dated Task, open and Closed, drawn on the days its dates cover. It
 * shows a month at a time, with controls to step between months and back to today. Clicking a
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
  const today = todayIn(timeZone);
  const { date, go } = useCalendarPlace(today);
  const { data } = useQuery(calendarQuery(monthRange(date)));
  const tasks = data?.items ?? [];
  const { openTaskId, setOpenTask } = useOpenTask();
  const { mutate: setStatus } = useSetTaskStatus();
  const toggle = useCallback(
    (task: Task) => {
      setStatus({ task, status: isClosed(task.status) ? "open" : "completed" });
    },
    [setStatus],
  );

  return (
    // `data-wide` lets the app shell drop its reading width for the grid.
    <div data-wide className="mx-auto w-full max-w-6xl">
      <header className="mb-4 flex items-center gap-2.5 sm:gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-hue-teal-soft text-hue-teal">
          <CalendarRange className="size-5" aria-hidden />
        </span>
        <h1 className="min-w-0 truncate text-2xl font-extrabold tracking-tight sm:text-3xl">
          {format(parseISO(date), "MMMM yyyy")}
        </h1>
        <div className="ml-auto flex shrink-0 items-center gap-1">
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
            aria-label="Previous month"
            onClick={() => {
              go(shiftMonths(date, -1));
            }}
          >
            <ChevronLeft aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Next month"
            onClick={() => {
              go(shiftMonths(date, 1));
            }}
          >
            <ChevronRight aria-hidden />
          </Button>
        </div>
      </header>

      <CalendarDrag tasks={tasks}>
        <MonthGrid
          date={date}
          today={today}
          tasks={tasks}
          onDateChange={(day) => {
            go(day, { replace: true });
          }}
          onOpen={setOpenTask}
          onToggle={toggle}
        />
      </CalendarDrag>

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
