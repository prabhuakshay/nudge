import { useMutation, useQueryClient } from "@tanstack/react-query";
import { differenceInCalendarDays, parseISO } from "date-fns";
import { toast } from "sonner";

import type { Dates } from "@/features/tasks/due";
import { patchTask, refreshTasks, showChange, TASKS_KEY } from "@/features/tasks/tasks";

import { clockTime, DAY_MINUTES, minutesOf, shiftDays, timeSpan } from "./layout";

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

/** Week and Day drags move and resize Tasks in steps of this many minutes. */
const SNAP_MINUTES = 15;

/**
 * The minutes from midnight at a point in a Week or Day column, snapped to 15 minutes and kept
 * inside the day. `hour` is the slot the pointer is over and `offset` how far down that slot the
 * point is, as a fraction of its height: below 0 or above 1 for a dragged block's edge that is
 * in a slot above or below the pointer, since every hour slot is as tall as the others.
 */
export function slotMinutes(hour: number, offset: number): number {
  const minutes = Math.round(((hour + offset) * 60) / SNAP_MINUTES) * SNAP_MINUTES;
  return Math.min(Math.max(minutes, 0), DAY_MINUTES);
}

/** The last minute a time on a day can be, since a due time can't be midnight at its end. */
const LAST_MINUTE = DAY_MINUTES - 1;

/** The "HH:MM:SS" time the API uses for a number of minutes after midnight. */
function timeOf(minutes: number): string {
  return `${clockTime(minutes)}:00`;
}

/**
 * A Task's dates after it is dropped on a time in Week or Day mode: on the day `to`, starting at
 * `start` minutes from midnight. A range on one day keeps its length, kept inside the day; an
 * all-day Task gets that time. A range over several days only moves by days, like in Month.
 */
export function moveToTime(dates: DueDates, from: string, to: string, start: number): DueDates {
  const { start_date, start_time, due_date, due_time } = dates;
  if (start_date !== null && start_date !== due_date) return moveDates(dates, from, to);
  if (start_time === null || due_time === null) {
    return {
      start_date: null,
      start_time: null,
      due_date: to,
      due_time: timeOf(Math.min(start, LAST_MINUTE)),
    };
  }
  const length = minutesOf(due_time) - minutesOf(start_time);
  const begins = Math.min(start, LAST_MINUTE - length);
  return {
    start_date: to,
    start_time: timeOf(begins),
    due_date: to,
    due_time: timeOf(begins + length),
  };
}

/**
 * A Task's dates after it is dropped in Week or Day mode's all-day strip: a timed block loses its
 * time and moves to the strip's day. A Task already in the strip moves by days, keeping its times.
 */
export function moveToAllDay(dates: DueDates, from: string, to: string): DueDates {
  const moved = moveDates(dates, from, to);
  if (timeSpan(dates) === null) return moved;
  return { start_date: null, start_time: null, due_date: moved.due_date, due_time: null };
}

/**
 * A timed Task's dates after its block's bottom edge is dragged to `end` minutes from midnight:
 * it is due then, at least 15 minutes after it starts and inside its day. A Task with no start
 * gets one where its block's top is, so the block stays in place.
 */
export function resizeEnd(dates: DueDates, end: number): DueDates {
  const span = timeSpan(dates);
  if (span === null) return dates;
  return {
    start_date: dates.due_date,
    start_time: timeOf(span.start),
    due_date: dates.due_date,
    due_time: timeOf(Math.min(Math.max(end, span.start + SNAP_MINUTES), LAST_MINUTE)),
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
