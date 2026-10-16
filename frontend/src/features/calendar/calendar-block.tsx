import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import type { ChipDrag } from "./calendar-task";
import { clockTime, percent, type Block, type TimeSpan } from "./layout";
import type { CalendarItem } from "./occurrences";
import { TaskCard, type CardProps } from "./task-card";

/** Where a block sits in its hour slot, `stretch` pixels taller while its end is dragged. */
function placement({ span, column, columns }: Block<CalendarItem>, stretch: number) {
  const height = percent((span.end - span.start) / 60);
  return {
    top: percent((span.start % 60) / 60),
    height: stretch === 0 ? height : `calc(${height} + ${String(stretch)}px)`,
    left: percent(column / columns),
    width: percent(1 / columns),
  };
}

function spanLabel({ start, end }: TimeSpan) {
  return `${clockTime(start)} – ${clockTime(end)}`;
}

/**
 * A timed Task as Week and Day mode draw it: a block in its Project's colour, placed inside the
 * hour slot it starts in and as tall as its span, overflowing into the slots below. Overlapping
 * blocks take their share of the width. Like the Month chip it ticks in place, opens on click,
 * and shows Closed, Overdue and future Occurrences the same way.
 */
export function CalendarBlock({
  block,
  drag,
  stretch = 0,
  edge,
  card,
  filling = false,
}: {
  block: Block<CalendarItem>;
  card: CardProps;
  /** What lets the block be dragged to another time, from `DraggableBlock`. */
  drag?: ChipDrag;
  /** The pixels its end is pulled down (or up, below zero) while it is dragged. */
  stretch?: number;
  /** The bottom edge that changes when it ends, from `DraggableBlock`. */
  edge?: ReactNode;
  /** Fill its container instead of its place in the slot, for the picture of it being dragged. */
  filling?: boolean;
}) {
  return (
    <li
      ref={drag?.setNode}
      {...drag?.listeners}
      className={cn("absolute z-10 p-px", filling && "inset-0", drag?.dragging && "opacity-40")}
      style={filling ? undefined : placement(block, stretch)}
    >
      <TaskCard task={block.task} shape="block" time={spanLabel(block.span)} card={card} />
      {edge}
    </li>
  );
}
