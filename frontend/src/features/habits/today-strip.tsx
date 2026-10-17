import { useQuery } from "@tanstack/react-query";

import { RowMenu } from "@/features/projects/sidebar-rows";
import { cn } from "@/lib/utils";

import { CheckInButton, UndoCheckInItem } from "./check-in";
import { todayHabitsQuery, type Habit } from "./habits";

function HabitChip({ habit, timeZone }: { habit: Habit; timeZone: string }) {
  return (
    <li
      className={cn(
        "group flex items-center gap-1 rounded-full border border-border bg-surface py-0.5 pr-1 pl-0.5 shadow-sm transition-opacity",
        habit.today_count >= habit.goal && "opacity-60",
      )}
    >
      <CheckInButton habit={habit} timeZone={timeZone}>
        <span className="max-w-40 truncate pr-1 pl-0.5 text-sm font-medium">{habit.name}</span>
      </CheckInButton>
      <RowMenu label={`${habit.name} options`}>
        <UndoCheckInItem habit={habit} timeZone={timeZone} />
      </RowMenu>
    </li>
  );
}

/**
 * Today's Habits as a strip of chips above Today's Tasks. A tap on a chip checks in, its menu
 * undoes the latest Check-in, and a Habit done today fades but stays. The strip is absent while
 * no Habit is due. `timeZone` is the user's, which decides what today is.
 */
export function TodayHabits({ timeZone }: { timeZone: string }) {
  const { data: habits = [] } = useQuery(todayHabitsQuery);
  if (habits.length === 0) return null;

  return (
    <ul aria-label="Today's habits" className="mb-4 flex flex-wrap gap-2">
      {habits.map((habit) => (
        <HabitChip key={habit.id} habit={habit} timeZone={timeZone} />
      ))}
    </ul>
  );
}
