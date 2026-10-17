import { Check, Undo2 } from "lucide-react";
import { useId, type ReactNode } from "react";

import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { HUE } from "@/features/projects/project-style";
import { todayIn } from "@/features/tasks/schedule";
import { cn } from "@/lib/utils";

import { useSetCheckIns, type Habit } from "./habits";

/** What today's Check-ins come to, as the Check-in button describes it. */
function progressLabel({ today_count: count, goal }: Habit) {
  if (count >= goal) return "Done today";
  if (goal === 1) return "Not done today";
  return `${String(count)} of ${String(goal)} today`;
}

/**
 * Today's Check-in button: a ring that fills one Check-in at a time toward the Goal, solid with
 * a check once the Goal is met. A tap once it's met does nothing, so the count stays at the Goal.
 * `children` show beside the ring and take taps too, as a Today strip chip's name does.
 * `timeZone` is the user's, which decides what today is.
 */
export function CheckInButton({
  habit,
  timeZone,
  children,
}: {
  habit: Habit;
  timeZone: string;
  children?: ReactNode;
}) {
  const setCheckIns = useSetCheckIns(timeZone);
  const progressId = useId();
  const done = habit.today_count >= habit.goal;
  return (
    <button
      type="button"
      aria-label={`Check in ${habit.name}`}
      aria-describedby={progressId}
      onClick={() => {
        if (!done)
          setCheckIns.mutate({
            id: habit.id,
            day: todayIn(timeZone),
            count: habit.today_count + 1,
          });
      }}
      className="flex min-w-0 shrink-0 items-center rounded-full focus-visible:outline-2 focus-visible:outline-ring"
    >
      <span id={progressId} className="sr-only">
        {progressLabel(habit)}
      </span>
      <CheckInRing habit={habit} />
      {children}
    </button>
  );
}

/** The ring of a Check-in button, filled toward the Goal, or solid with a check once it's met. */
function CheckInRing({ habit }: { habit: Habit }) {
  const hue = HUE[habit.color];
  const done = habit.today_count >= habit.goal;
  const filled = Math.min(habit.today_count / habit.goal, 1) * 100;
  return (
    <span className="relative flex size-11 shrink-0 items-center justify-center lg:size-9">
      {done ? (
        <span
          aria-hidden
          className={cn(
            "flex size-8 items-center justify-center rounded-full text-primary-foreground",
            hue.bg,
          )}
        >
          <Check className="size-4" strokeWidth={3} />
        </span>
      ) : (
        <svg aria-hidden viewBox="0 0 36 36" className="size-8 -rotate-90">
          <circle cx="18" cy="18" r="15" fill="none" strokeWidth="3" className="stroke-border" />
          {/* A round cap would show an empty ring as a dot. */}
          {filled > 0 && (
            <circle
              cx="18"
              cy="18"
              r="15"
              fill="none"
              strokeWidth="3"
              strokeLinecap="round"
              pathLength={100}
              strokeDasharray={`${String(filled)} 100`}
              className={cn("stroke-current transition-[stroke-dasharray]", hue.text)}
            />
          )}
        </svg>
      )}
      {!done && habit.goal > 1 && (
        <span aria-hidden className="absolute text-[10px] font-semibold tabular-nums">
          {habit.today_count}
        </span>
      )}
    </span>
  );
}

/** A Habit menu's item that takes back today's latest Check-in; off before the first one. */
export function UndoCheckInItem({ habit, timeZone }: { habit: Habit; timeZone: string }) {
  const setCheckIns = useSetCheckIns(timeZone);
  return (
    <DropdownMenuItem
      disabled={habit.today_count === 0}
      onSelect={() => {
        setCheckIns.mutate({ id: habit.id, day: todayIn(timeZone), count: habit.today_count - 1 });
      }}
    >
      <Undo2 aria-hidden /> Undo Check-in
    </DropdownMenuItem>
  );
}
