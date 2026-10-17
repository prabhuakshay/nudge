import { useQuery } from "@tanstack/react-query";
import { Flame, Pencil, Plus } from "lucide-react";
import { useState } from "react";

import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";

import { HabitDialog } from "./habit-dialog";
import { HabitIcon } from "./habit-icon";
import { habitsQuery, type Habit } from "./habits";

/** The Habits page: the user's Habits in their order, with buttons to add and edit them. */
export function HabitsPage() {
  const { data: habits } = useQuery(habitsQuery);
  const [adding, setAdding] = useState(false);
  // Kept after the Edit dialog closes, so it shows the same Habit while it animates out.
  const [editing, setEditing] = useState<Habit>();
  const [editOpen, setEditOpen] = useState(false);
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
            <li
              key={habit.id}
              className="flex min-h-14 items-center gap-3 border-b border-border/60 px-4 py-2 last:border-b-0"
            >
              <HabitIcon habit={habit} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{habit.name}</span>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Edit ${habit.name}`}
                className="text-muted-foreground"
                onClick={() => {
                  setEditing(habit);
                  setEditOpen(true);
                }}
              >
                <Pencil aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <HabitDialog open={adding} onOpenChange={setAdding} />
      {editing && <HabitDialog open={editOpen} onOpenChange={setEditOpen} habit={editing} />}
    </div>
  );
}
