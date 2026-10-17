import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { Minus, Plus } from "lucide-react";
import { useId, useRef, useState, type KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import { HUE } from "@/features/projects/project-style";
import { addDays, todayIn } from "@/features/tasks/schedule";
import { cn } from "@/lib/utils";

import { checkInsQuery, useSetCheckIns, type Habit } from "./habits";
import { cellShade, heatmapWeeks, type CellShade, type ShadeLevel } from "./heatmap";
import { dayState, describeDay } from "./recent-days";

/** The days each arrow key moves by: a row is a weekday, a column a week. */
const STEPS: Partial<Record<string, number>> = {
  ArrowUp: -1,
  ArrowDown: 1,
  ArrowLeft: -7,
  ArrowRight: 7,
};

const LEVEL: Record<ShadeLevel, string> = {
  0: "",
  1: "opacity-35",
  2: "opacity-60",
  3: "opacity-80",
  4: "",
};

/** A day as the heatmap names it, with the year only when it isn't this year. */
function dayName(date: string, today: string) {
  const sameYear = date.slice(0, 4) === today.slice(0, 4);
  return format(parseISO(date), sameYear ? "EEE d MMM" : "EEE d MMM yyyy");
}

/**
 * The Habit's last 12 months as a heatmap: one column a week, one row a weekday, each day shaded
 * by its share of the Goal and dimmed when the Habit doesn't ask for it. Tapping a day up to today
 * adds a Check-in; the arrow keys pick a day, and the row under the heatmap sets the picked day's
 * exact count. On phones it scrolls sideways and opens on the latest months. `timeZone` is the
 * user's, which decides what today is.
 */
export function HabitHeatmap({ habit, timeZone }: { habit: Habit; timeZone: string }) {
  const today = todayIn(timeZone);
  const weeks = heatmapWeeks(today);
  const first = weeks[0]?.[0] ?? today;
  const { data: checkIns = [] } = useQuery(checkInsQuery(habit.id, first, today));
  const setCheckIns = useSetCheckIns(timeZone);
  const [picked, setPicked] = useState(today);
  const cells = useRef(new Map<string, HTMLButtonElement>());

  const counts = new Map(checkIns.map((checkIn) => [checkIn.date, checkIn.count]));
  // Today's count comes from the Habit, so a Check-in from its row shows here at once.
  const countOn = (date: string) => (date === today ? habit.today_count : (counts.get(date) ?? 0));
  const set = (date: string, count: number) => {
    setCheckIns.mutate({ id: habit.id, day: date, count });
  };
  const tap = (date: string) => {
    const count = countOn(date);
    if (cellShade(habit, date, count, today).editable && count < habit.goal) set(date, count + 1);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    const step = STEPS[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const moved = addDays(picked, step);
    const next = moved < first ? first : moved > today ? today : moved;
    cells.current.get(next)?.focus();
  };

  return (
    <div>
      <div
        // Open on the latest months, which a phone's narrow screen would otherwise hide.
        ref={(scroller) => {
          if (scroller) scroller.scrollLeft = scroller.scrollWidth;
        }}
        className="-mx-4 overflow-x-auto px-4 pb-2 lg:mx-0 lg:overflow-visible lg:px-0"
      >
        <div className="flex w-max flex-col gap-1 lg:w-full lg:gap-0.5">
          <MonthLabels weeks={weeks} />
          <div role="grid" aria-label={`${habit.name}, last 12 months`}>
            {[0, 1, 2, 3, 4, 5, 6].map((weekday) => (
              <div key={weekday} role="row" className="flex gap-1 pb-1 lg:gap-0.5 lg:pb-0.5">
                {weeks.map((week) => {
                  const date = week[weekday] ?? today;
                  return (
                    <div key={date} role="gridcell" className="flex size-4 lg:size-auto lg:flex-1">
                      {date <= today && (
                        <HeatmapCell
                          habit={habit}
                          date={date}
                          label={dayName(date, today)}
                          count={countOn(date)}
                          shade={cellShade(habit, date, countOn(date), today)}
                          picked={date === picked}
                          ref={(cell) => {
                            if (cell) cells.current.set(date, cell);
                            else cells.current.delete(date);
                          }}
                          onKeyDown={onKeyDown}
                          onFocus={() => {
                            setPicked(date);
                          }}
                          onClick={() => {
                            tap(date);
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      <DayCount
        label={dayName(picked, today)}
        count={countOn(picked)}
        goal={habit.goal}
        editable={cellShade(habit, picked, countOn(picked), today).editable}
        onSet={(count) => {
          set(picked, count);
        }}
      />
    </div>
  );
}

/** The month names above the heatmap, each over the week its 1st falls in. */
function MonthLabels({ weeks }: { weeks: string[][] }) {
  return (
    <div aria-hidden className="flex gap-1 text-[10px] text-muted-foreground lg:gap-0.5">
      {weeks.map((week, index) => {
        const firstOfMonth = week.find((date) => date.endsWith("-01"));
        const month = index === 0 ? week[0] : firstOfMonth;
        return (
          <span
            key={week[0]}
            className="w-4 shrink-0 overflow-visible whitespace-nowrap lg:w-auto lg:flex-1"
          >
            {month && format(parseISO(month), "MMM")}
          </span>
        );
      })}
    </div>
  );
}

type HeatmapCellProps = {
  habit: Habit;
  date: string;
  label: string;
  count: number;
  shade: CellShade;
  picked: boolean;
  ref: (cell: HTMLButtonElement | null) => void;
  onKeyDown: (event: KeyboardEvent) => void;
  onFocus: () => void;
  onClick: () => void;
};

/** One day of the heatmap, a tab stop only while it is the picked day. */
function HeatmapCell({
  habit,
  date,
  label,
  count,
  shade,
  picked,
  ref,
  onKeyDown,
  onFocus,
  onClick,
}: HeatmapCellProps) {
  const says = shade.editable
    ? describeDay(dayState(habit, date, count), count, habit.goal)
    : "not started";
  return (
    <button
      ref={ref}
      type="button"
      tabIndex={picked ? 0 : -1}
      aria-label={`${label}: ${says}`}
      aria-disabled={!shade.editable || undefined}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      onClick={onClick}
      className={cn(
        "size-full rounded-[3px] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring lg:aspect-square",
        shade.level === 0 ? "bg-surface-muted" : [HUE[habit.color].bg, LEVEL[shade.level]],
        shade.dimmed && "opacity-40",
        picked && "ring-1 ring-foreground/60",
      )}
    />
  );
}

type DayCountProps = {
  label: string;
  count: number;
  goal: number;
  editable: boolean;
  onSet: (count: number) => void;
};

/** The picked day's Check-ins against the Goal, with buttons to set the exact count. */
function DayCount({ label, count, goal, editable, onSet }: DayCountProps) {
  const labelId = useId();
  return (
    <div
      role="group"
      aria-labelledby={labelId}
      className="mt-3 flex items-center gap-2 rounded-lg bg-surface-muted py-1 pr-1 pl-3"
    >
      <span id={labelId} className="flex-1 text-sm font-medium">
        {label}
      </span>
      <span className="text-sm text-muted-foreground tabular-nums">
        {editable ? `${String(count)} of ${String(goal)}` : "Not started"}
      </span>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Remove a Check-in"
        disabled={!editable || count === 0}
        onClick={() => {
          onSet(count - 1);
        }}
      >
        <Minus aria-hidden />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Add a Check-in"
        disabled={!editable || count >= goal}
        onClick={() => {
          onSet(count + 1);
        }}
      >
        <Plus aria-hidden />
      </Button>
    </div>
  );
}
