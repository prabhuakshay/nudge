import { useQuery } from "@tanstack/react-query";
import { Flame, Plus } from "lucide-react";
import { useState } from "react";

import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";

import { HabitDialog } from "./habit-dialog";
import { HabitRow } from "./habit-row";
import { habitsQuery } from "./habits";

/**
 * The Habits page: the user's Habits in their order, each with today's Check-in button, and a
 * button to add one. `timeZone` is the user's, which decides what today is.
 */
export function HabitsPage({ timeZone }: { timeZone: string }) {
  const { data: habits } = useQuery(habitsQuery);
  const [adding, setAdding] = useState(false);
  return (
    <div className="mx-auto w-full max-w-3xl">
      <header className="mb-4 flex items-center gap-2.5 sm:gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
          <Flame className="size-5" aria-hidden />
        </span>
        <h1 className="min-w-0 flex-1 truncate text-2xl font-extrabold tracking-tight sm:text-3xl">
          Habits
        </h1>
        <Button
          onClick={() => {
            setAdding(true);
          }}
        >
          <Plus aria-hidden />
          Add habit
        </Button>
      </header>

      {habits?.length === 0 && (
        <EmptyState
          icon={Flame}
          title="No habits yet"
          description="Add something you want to do every day, then check in each day you do it."
        />
      )}
      {habits && habits.length > 0 && (
        <ul
          aria-label="Habits"
          className="overflow-hidden rounded-xl border border-border bg-surface"
        >
          {habits.map((habit) => (
            <HabitRow key={habit.id} habit={habit} timeZone={timeZone} />
          ))}
        </ul>
      )}

      <HabitDialog open={adding} onOpenChange={setAdding} />
    </div>
  );
}
