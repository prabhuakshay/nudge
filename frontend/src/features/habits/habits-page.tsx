import { useQuery } from "@tanstack/react-query";
import { Flame, Plus } from "lucide-react";
import { useState } from "react";

import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

import { DeleteHabitDialog } from "./delete-habit-dialog";
import { HabitDetail } from "./habit-detail";
import { HabitDialog } from "./habit-dialog";
import { ArchivedHabits, HabitList } from "./habit-rows";
import { habitsQuery, type Habit } from "./habits";
import { useOpenHabit } from "./open-habit";

type HabitActions = {
  onOpen: (habit: Habit) => void;
  onEdit: (habit: Habit) => void;
  onDelete: (habit: Habit) => void;
};

/**
 * The Habits page: the user's Habits in their order, a button to add one, and the Archived ones
 * in a collapsed section at the bottom. A Habit's name opens its details, beside the list from
 * `lg` and as the whole page on phones. `timeZone` is the user's, which decides what today is for
 * Check-ins and a new Habit's start date.
 */
export function HabitsPage({ timeZone }: { timeZone: string }) {
  const { data: habits } = useQuery(habitsQuery);
  const { openHabitId, setOpenHabit } = useOpenHabit();
  const wide = useMediaQuery("(min-width: 1024px)");
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<Habit | null>(null);
  // Kept after the Edit dialog closes, so it shows the same Habit while it animates out.
  const [editing, setEditing] = useState<Habit>();
  const [editOpen, setEditOpen] = useState(false);
  // A link to a Habit that is gone, or never was the user's, just shows the list.
  const open = habits?.find((habit) => habit.id === openHabitId);
  const beside = open !== undefined && wide;
  const actions: HabitActions = {
    onOpen: (habit) => {
      setOpenHabit(habit.id);
    },
    onEdit: (habit) => {
      setEditing(habit);
      setEditOpen(true);
    },
    onDelete: setDeleting,
  };

  return (
    <div
      // The app shell widens the page for anything marked wide, which the panel needs.
      data-wide={beside ? "" : undefined}
      className={cn(
        "mx-auto w-full max-w-3xl",
        beside && "grid max-w-6xl grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-6",
      )}
    >
      {open && !wide ? null : (
        <HabitLists
          habits={habits}
          timeZone={timeZone}
          onAdd={() => {
            setAdding(true);
          }}
          {...actions}
        />
      )}
      {open && (
        <HabitDetail
          habit={open}
          timeZone={timeZone}
          fullPage={!wide}
          onClose={() => {
            setOpenHabit(null);
          }}
          {...actions}
        />
      )}

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
        onDeleted={(habit) => {
          if (habit.id === openHabitId) setOpenHabit(null);
        }}
      />
    </div>
  );
}

/** The page's header, the live Habits (or an invitation to add one) and the Archived section. */
function HabitLists({
  habits,
  timeZone,
  onAdd,
  onOpen,
  onEdit,
  onDelete,
}: HabitActions & { habits: Habit[] | undefined; timeZone: string; onAdd: () => void }) {
  const live = habits?.filter((habit) => !habit.is_archived) ?? [];
  const archived = habits?.filter((habit) => habit.is_archived) ?? [];
  return (
    <div className="min-w-0">
      <header className="mb-4 flex items-center gap-2.5 sm:gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
          <Flame className="size-5" aria-hidden />
        </span>
        <h1 className="min-w-0 flex-1 truncate text-2xl font-extrabold tracking-tight sm:text-3xl">
          Habits
        </h1>
        <Button onClick={onAdd}>
          <Plus aria-hidden />
          Add habit
        </Button>
      </header>

      {habits?.length === 0 && (
        <EmptyState
          icon={Flame}
          title="No habits yet"
          description="Add something you want to do regularly, then check in whenever you do it."
        />
      )}
      {live.length > 0 && (
        <HabitList
          habits={live}
          timeZone={timeZone}
          onOpen={onOpen}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      )}
      <ArchivedHabits habits={archived} onOpen={onOpen} onDelete={onDelete} />
    </div>
  );
}
