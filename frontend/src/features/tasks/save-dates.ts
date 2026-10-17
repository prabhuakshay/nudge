import { useQueryClient } from "@tanstack/react-query";

import { changeDates, type Dates } from "./due";
import { useUndoableTaskChanges } from "./task-undo";
import { taskQuery, useUpdateTask, type Task } from "./tasks";

/** A Task's dates and what goes with them, which the date picker changes. */
export type DatedTask = Dates & Pick<Task, "id" | "parent_id" | "repeat_rule" | "repeat_from">;

/**
 * Save changes to a Task's dates. Removing the due date removes the Reminders and Repeat on the
 * server too, so it offers Undo, which puts back the dates, the Reminders and the Repeat.
 */
export function useSaveDates(task: DatedTask) {
  const queryClient = useQueryClient();
  const { mutate: update } = useUpdateTask();
  const { removeDates } = useUndoableTaskChanges();

  return (change: Partial<Dates>) => {
    const next = changeDates(task, change);
    if (next.due_date !== null) {
      update({ id: task.id, dates: { ...next, due_date: next.due_date } });
      return;
    }
    if (task.due_date === null) return;
    // The picker loads the Task's Reminders while it is open, so they are in the cache.
    const detail = queryClient.getQueryData(taskQuery(task.id).queryKey);
    removeDates(task, detail?.reminders.map((reminder) => reminder.offset) ?? []);
  };
}
