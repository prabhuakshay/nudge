import { useQueryClient } from "@tanstack/react-query";

import { toastWithUndo } from "@/lib/undo-toast";

import { changeDates, type Dates } from "./due";
import { taskQuery, useUpdateTask, type Task } from "./tasks";

/** A Task's dates and what goes with them, which the date picker changes. */
export type DatedTask = Dates & Pick<Task, "id" | "parent_id" | "repeat_rule" | "repeat_from">;

/** What removing the due date removed, as its toast says: "Date, reminders and repeat removed". */
function removedMessage(reminders: boolean, repeat: boolean): string {
  const removed = ["Date", ...(reminders ? ["reminders"] : []), ...(repeat ? ["repeat"] : [])];
  const last = removed.pop() ?? "";
  return `${removed.length > 0 ? `${removed.join(", ")} and ${last}` : last} removed`;
}

/**
 * Save changes to a Task's dates. Removing the due date removes the Reminders and Repeat on the
 * server too, so it offers Undo, which puts back the dates, the Reminders and the Repeat.
 */
export function useSaveDates(task: DatedTask) {
  const queryClient = useQueryClient();
  const { mutate: update } = useUpdateTask();

  return (change: Partial<Dates>) => {
    const next = changeDates(task, change);
    if (next.due_date !== null) {
      update({ id: task.id, dates: { ...next, due_date: next.due_date } });
      return;
    }
    const { due_date: dueDate } = task;
    if (dueDate === null) return;
    // The picker loads the Task's Reminders while it is open, so they are in the cache.
    const detail = queryClient.getQueryData(taskQuery(task.id).queryKey);
    const reminders = detail?.reminders.map((reminder) => reminder.offset) ?? [];
    const repeat = task.repeat_rule
      ? { repeat_rule: task.repeat_rule, repeat_from: task.repeat_from }
      : undefined;
    const before = {
      due_date: dueDate,
      due_time: task.due_time,
      start_date: task.start_date,
      start_time: task.start_time,
    };
    update(
      { id: task.id, dates: null },
      {
        onSuccess: () => {
          toastWithUndo(removedMessage(reminders.length > 0, repeat !== undefined), () => {
            update({ id: task.id, dates: before, reminders, ...repeat });
          });
        },
      },
    );
  };
}
