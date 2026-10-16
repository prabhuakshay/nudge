/* An empty place on the Calendar a new Task can go, and the Quick add that adds it there. */

import { format, parseISO } from "date-fns";
import type { KeyboardEvent, MouseEvent } from "react";

import type { QuickAddView } from "@/features/tasks/quick-add-view";

/** A day, and the "HH:MM" an hour slot starts at, or null for the whole day. */
export type Slot = { day: string; time: string | null };

/** Quick add for a slot: it starts with the slot's date and time as a removable chip. */
export function slotView({ day, time }: Slot): QuickAddView {
  const label = format(parseISO(day), "EEE d MMM");
  return time === null
    ? { kind: "calendar", label, dates: { due_date: day } }
    : { kind: "calendar", label: `${label}, ${time}`, dates: { due_date: day, due_time: time } };
}

/**
 * Whether a click or Enter on a slot is meant for the slot itself, not a Task, a button or a
 * popover inside it. React passes events up from portals, so the target is checked to be in the
 * slot's own DOM.
 */
export function addsToSlot(event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>): boolean {
  if ("key" in event) return event.key === "Enter" && event.target === event.currentTarget;
  const { target, currentTarget } = event;
  return (
    target instanceof Element && currentTarget.contains(target) && !target.closest("li, button")
  );
}
