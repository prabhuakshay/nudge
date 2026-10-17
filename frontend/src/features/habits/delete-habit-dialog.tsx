import type { SubmitEvent } from "react";

import { DialogFooter, SidebarDialog } from "@/features/projects/project-dialog";

import { useDeleteHabit, type Habit } from "./habits";

/** Asks before a Habit and its history are deleted, which can't be undone. */
export function DeleteHabitDialog({
  habit,
  onClose,
}: {
  habit: Habit | null;
  onClose: () => void;
}) {
  const deleteHabit = useDeleteHabit();
  if (!habit) return null;
  const { id } = habit;

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    deleteHabit.mutate(id);
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
