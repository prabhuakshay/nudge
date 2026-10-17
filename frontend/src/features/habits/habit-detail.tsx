import { Archive, ArchiveRestore, ArrowLeft, Pencil, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { HabitHeatmap } from "./habit-heatmap";
import { HabitIcon } from "./habit-icon";
import { streakLength, useSetArchived, type Habit } from "./habits";

type HabitDetailProps = {
  habit: Habit;
  /** The user's time zone, which decides what today is. */
  timeZone: string;
  /** Whether the details take the whole page, as on phones, rather than a panel beside the list. */
  fullPage: boolean;
  onClose: () => void;
  onEdit: (habit: Habit) => void;
  onDelete: (habit: Habit) => void;
};

/**
 * A Habit's details: its current and best Streak, its heatmap, and buttons to edit, archive or
 * delete it. A panel beside the list from `lg`, the whole page on phones.
 */
export function HabitDetail({
  habit,
  timeZone,
  fullPage,
  onClose,
  onEdit,
  onDelete,
}: HabitDetailProps) {
  const setArchived = useSetArchived();
  return (
    <section
      aria-label={`${habit.name} details`}
      className={cn(
        "flex min-w-0 flex-col gap-5",
        !fullPage && "self-start rounded-xl border border-border bg-surface p-4 lg:sticky lg:top-6",
      )}
    >
      <header className="flex items-center gap-3">
        {fullPage && (
          <Button variant="ghost" size="icon" aria-label="Back to Habits" onClick={onClose}>
            <ArrowLeft aria-hidden />
          </Button>
        )}
        <HabitIcon habit={habit} />
        <h2 className="min-w-0 flex-1 truncate text-lg font-bold">{habit.name}</h2>
        {!fullPage && (
          <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose}>
            <X aria-hidden />
          </Button>
        )}
      </header>

      <dl className="grid grid-cols-2 gap-3">
        <Stat
          label="Current streak"
          value={streakLength(habit.current_streak, habit.streak_unit)}
        />
        <Stat label="Best streak" value={streakLength(habit.best_streak, habit.streak_unit)} />
      </dl>

      <HabitHeatmap habit={habit} timeZone={timeZone} />

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() => {
            onEdit(habit);
          }}
        >
          <Pencil aria-hidden /> Edit
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setArchived.mutate({ id: habit.id, archived: !habit.is_archived });
          }}
        >
          {habit.is_archived ? (
            <>
              <ArchiveRestore aria-hidden /> Unarchive
            </>
          ) : (
            <>
              <Archive aria-hidden /> Archive
            </>
          )}
        </Button>
        <Button
          variant="outline"
          className="text-danger"
          onClick={() => {
            onDelete(habit);
          }}
        >
          <Trash2 aria-hidden /> Delete
        </Button>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-muted px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
