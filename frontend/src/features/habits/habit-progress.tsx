import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { Flame } from "lucide-react";

import { HUE } from "@/features/projects/project-style";
import { addDays, todayIn } from "@/features/tasks/schedule";
import { cn } from "@/lib/utils";

import { checkInsQuery, type Habit } from "./habits";
import { lastSevenDays, type DayState } from "./recent-days";

/** A Streak's length with its unit, as in "3 days" or "1 week". */
function streakLength(count: number, unit: Habit["streak_unit"]) {
  const word = unit === "weeks" ? "week" : "day";
  return `${String(count)} ${word}${count === 1 ? "" : "s"}`;
}

/** The Habit's current Streak with its unit, and its best Streak. */
export function StreakLine({ habit }: { habit: Habit }) {
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      <Flame
        aria-hidden
        className={cn("size-3.5", habit.current_streak > 0 && HUE[habit.color].text)}
      />
      <span className="sr-only">Streak</span>
      <span>{streakLength(habit.current_streak, habit.streak_unit)}</span>
      <span aria-hidden>·</span>
      <span>Best {habit.best_streak}</span>
    </span>
  );
}

const SAYS: Record<DayState, (count: number, goal: number) => string> = {
  done: () => "done",
  partial: (count, goal) => `${String(count)} of ${String(goal)}`,
  none: () => "not done",
  unscheduled: () => "not asked for",
};

/**
 * The Habit's last seven days as dots, oldest first: solid for a day that met the Goal, soft for
 * one with some Check-ins, an outline for a miss, and dimmed for a day the Habit doesn't ask for.
 * `timeZone` is the user's, which decides what today is.
 */
export function RecentDays({ habit, timeZone }: { habit: Habit; timeZone: string }) {
  const today = todayIn(timeZone);
  const { data: checkIns = [] } = useQuery(checkInsQuery(habit.id, addDays(today, -6), today));
  const hue = HUE[habit.color];
  return (
    <ol aria-label={`${habit.name}, last 7 days`} className="flex shrink-0 items-center gap-1">
      {lastSevenDays(habit, today, checkIns).map((day) => (
        <li key={day.date} className="flex">
          <span className="sr-only">
            {format(parseISO(day.date), "EEE d MMM")}: {SAYS[day.state](day.count, habit.goal)}
          </span>
          <span
            aria-hidden
            className={cn(
              "size-2.5 rounded-full",
              day.state === "done" && hue.bg,
              day.state === "partial" && hue.soft,
              day.state === "none" && "border border-border",
              day.state === "unscheduled" && "bg-surface-muted",
            )}
          />
        </li>
      ))}
    </ol>
  );
}
