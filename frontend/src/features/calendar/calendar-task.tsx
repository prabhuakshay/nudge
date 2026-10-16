import type { DraggableSyntheticListeners } from "@dnd-kit/core";

import { shortTime } from "@/features/tasks/due";
import { cn } from "@/lib/utils";

import type { CalendarItem } from "./occurrences";
import { TaskCard, type CardProps } from "./task-card";

/** A chip's drag handle: the node dnd-kit measures, the presses that start a drag and its state. */
export type ChipDrag = {
  setNode: (node: HTMLElement | null) => void;
  listeners: DraggableSyntheticListeners;
  dragging: boolean;
};

/** A chip that can't be dragged. */
const STILL: ChipDrag = { setNode: () => undefined, listeners: undefined, dragging: false };

/** The time a chip shows: a chip has room for one, and a range sits on the day by its start. */
function chipTime(task: CalendarItem) {
  const time = task.start_date === null ? task.due_time : task.start_time;
  return time === null ? null : shortTime(time);
}

/** A Task as a chip on a day, in Month mode and the all-day strip: one line, its time first. */
export function CalendarTask({
  task,
  card,
  drag: { setNode, listeners, dragging } = STILL,
}: {
  task: CalendarItem;
  card: CardProps;
  /** What lets the chip be dragged, from `DraggableTask`; without it the chip stays put. */
  drag?: ChipDrag;
}) {
  return (
    <li ref={setNode} {...listeners} className={cn("min-w-0", dragging && "opacity-40")}>
      <TaskCard task={task} shape="chip" time={chipTime(task)} card={card} />
    </li>
  );
}
