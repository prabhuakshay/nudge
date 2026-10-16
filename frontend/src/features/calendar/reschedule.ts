import { useMutation, useQueryClient } from "@tanstack/react-query";
import { differenceInCalendarDays, parseISO } from "date-fns";
import { toast } from "sonner";

import type { Dates } from "@/features/tasks/due";
import { patchTask, refreshTasks, showChange, TASKS_KEY } from "@/features/tasks/tasks";

import { shiftDays } from "./layout";

/** Dates with a due date, which every Task on the Calendar has. */
export type DueDates = Dates & { due_date: string };

/**
 * A Task's dates after it is dragged from one day to another: every date moves by the days
 * between them and the times stay, so a range keeps its length.
 */
export function moveDates(dates: DueDates, from: string, to: string): DueDates {
  const days = differenceInCalendarDays(parseISO(to), parseISO(from));
  return {
    start_date: dates.start_date && shiftDays(dates.start_date, days),
    start_time: dates.start_time,
    due_date: shiftDays(dates.due_date, days),
    due_time: dates.due_time,
  };
}

/** A drop on the Calendar: the Task and the dates it now has. */
export type Reschedule = { id: number; dates: DueDates };

/**
 * Save the dates a drag gave a Task. The Calendar and the lists show them straight away, and if
 * the save fails they go back to what they showed before and a toast says why, so the Calendar
 * never shows a date that wasn't saved. Only the dates are sent, so a repeating Task's current
 * Occurrence moves and its Repeat stays.
 */
export function useReschedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (change: Reschedule) => patchTask(change),
    onMutate: async (change) => {
      const before = queryClient.getQueriesData({ queryKey: TASKS_KEY });
      await showChange(queryClient, change);
      return before;
    },
    onError: (error, _change, before) => {
      for (const [key, data] of before ?? []) queryClient.setQueryData(key, data);
      toast.error(error.message);
    },
    onSettled: () => refreshTasks(queryClient),
  });
}
