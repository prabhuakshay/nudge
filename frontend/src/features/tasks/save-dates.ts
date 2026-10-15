import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { changeDates, type Dates } from "./due";
import { taskQuery, useUpdateTask } from "./tasks";

/**
 * Save changes to a Task's dates. Removing the due date removes the Reminders on the server too,
 * so it offers Undo, which puts back both the dates and the Reminders.
 */
export function useSaveDates(task: Dates & { id: number }) {
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
          toast(reminders.length > 0 ? "Date and reminders removed" : "Date removed", {
            action: {
              label: "Undo",
              onClick: () => {
                update({ id: task.id, dates: before, reminders });
              },
            },
          });
        },
      },
    );
  };
}
