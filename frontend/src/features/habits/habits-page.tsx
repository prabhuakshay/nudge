import { useQuery } from "@tanstack/react-query";
import { Flame, Plus } from "lucide-react";
import { useState } from "react";

import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";

import { DeleteHabitDialog } from "./delete-habit-dialog";
import { HabitDialog } from "./habit-dialog";
import { ArchivedHabits, HabitList } from "./habit-rows";
import { habitsQuery, type Habit } from "./habits";

/**
 * The Habits page: the user's Habits in their order, a button to add one, and the Archived ones
 * in a collapsed section at the bottom. Each row's menu edits its Habit. `timeZone` is the
 * user's, which decides what today is for Check-ins and a new Habit's start date.
 */
export function HabitsPage({ timeZone }: { timeZone: string }) {
  const { data: habits } = useQuery(habitsQuery);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<Habit | null>(null);
  // Kept after the Edit dialog closes, so it shows the same Habit while it animates out.
  const [editing, setEditing] = useState<Habit>();
  const [editOpen, setEditOpen] = useState(false);
  const live = habits?.filter((habit) => !habit.is_archived) ?? [];
  const archived = habits?.filter((habit) => habit.is_archived) ?? [];
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
      {live.length > 0 && (
        <HabitList
          habits={live}
          timeZone={timeZone}
          onEdit={(habit) => {
            setEditing(habit);
            setEditOpen(true);
          }}
          onDelete={setDeleting}
        />
      )}
      <ArchivedHabits habits={archived} onDelete={setDeleting} />

      <HabitDialog open={adding} onOpenChange={setAdding} timeZone={timeZone} />
      {editing && (
        <HabitDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          timeZone={timeZone}
          habit={editing}
        />
      )}
      <DeleteHabitDialog
        habit={deleting}
        onClose={() => {
          setDeleting(null);
        }}
      />
    </div>
  );
}
