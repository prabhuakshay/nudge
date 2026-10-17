import type { SubmitEvent } from "react";

import { DialogFooter, SidebarDialog } from "@/features/projects/project-dialog";

import { useDeleteHabit, type Habit } from "./habits";

/**
 * Asks before a Habit and its history are deleted, which can't be undone. `onDeleted` runs once
 * the user confirms, and `onClose` whenever the dialog closes.
 */
export function DeleteHabitDialog({
  habit,
  onClose,
  onDeleted,
}: {
  habit: Habit | null;
  onClose: () => void;
  onDeleted: (habit: Habit) => void;
}) {
  const deleteHabit = useDeleteHabit();
  if (!habit) return null;
  const deleting = habit;

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    deleteHabit.mutate(deleting.id);
    onDeleted(deleting);
    onClose();
  }

  return (
    <SidebarDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={`Delete “${habit.name}”?`}
    >
      <form onSubmit={handleSubmit} className="flex flex-col">
        <p className="px-5 pb-5 text-sm text-muted-foreground">
          Its check-ins and streaks go with it. This can&apos;t be undone. To keep its history,
          archive it instead.
        </p>
        <DialogFooter pending={false} label="Delete" />
      </form>
    </SidebarDialog>
  );
}
