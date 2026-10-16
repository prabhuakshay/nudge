import { useDraggable, useDroppable, type Active, type Over } from "@dnd-kit/core";

import type { Task } from "@/features/tasks/tasks";

import type { Row } from "./layout";

/** What is dragged: a Month or all-day chip, a Week or Day block, or a block's bottom edge. */
export type Grip = "chip" | "block" | "end";

/** A Task's grip on the Calendar: one per day it covers, so the day is in it. */
export type Handle = { task: Task; day: string; grip: Grip };

/** Where a drop lands: a Month day, or a Week or Day slot. */
export type Target = { day: string; row?: Row };

/** Lets a Task's grip be dragged inside `CalendarDrag`, carrying the grip to the drop. */
export function useGrip(handle: Handle, disabled: boolean | undefined) {
  const { task, day, grip } = handle;
  return useDraggable({ id: `${day}/${String(task.id)}/${grip}`, data: handle, disabled });
}

/** Makes a Month day or a Week or Day slot somewhere Tasks can be dropped inside `CalendarDrag`. */
export function useDropTarget(target: Target) {
  return useDroppable({ id: `${target.day}@${String(target.row)}`, data: target });
}

// dnd-kit types `data` as any record; here only `useGrip` and `useDropTarget` set it.

/** The grip being dragged, as `useGrip` gave it. */
export function handleOf(active: Active): Handle {
  return active.data.current as Handle;
}

/** The day or slot dropped on, as `useDropTarget` gave it. */
export function targetOf(over: Over): Target {
  return over.data.current as Target;
}
