import {
  DndContext,
  DragOverlay,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { CalendarBlock } from "./calendar-block";
import { CalendarTask } from "./calendar-task";
import { handleOf, targetOf, useGrip, type Grip, type Handle, type Target } from "./drag-data";
import type { CalendarItem } from "./occurrences";
import { timeSpan, type Block } from "./layout";
import {
  moveDates,
  moveToAllDay,
  moveToTime,
  resizeEnd,
  slotMinutes,
  useReschedule,
  type DueDates,
} from "./reschedule";
import type { CardProps } from "./task-card";

// Module constants, not inline objects: dnd-kit memoizes sensors on these options. A mouse drag
// starts after 5 px so a click still opens the Task; touch needs a press and hold so the page
// still scrolls. There is no keyboard drag: the arrow keys move between days, and Task detail's
// date picker is the keyboard way to reschedule.
const MOUSE = { activationConstraint: { distance: 5 } };
const TOUCH = { activationConstraint: { delay: 220, tolerance: 6 } };

/** A Task while it is dragged, with the y of its dragged edge when it was picked up. */
type Dragged = Handle & { edge: number };

/**
 * The dates a drop gives a Task. `at` reads the time at the dragged edge for an hour slot: the
 * block's top when it moves, its bottom when it is resized.
 */
function droppedDates(
  dates: DueDates,
  { day, grip }: Handle,
  target: Target,
  at: (hour: number) => number,
): DueDates | null {
  const { row } = target;
  if (grip === "end") return typeof row === "number" ? resizeEnd(dates, at(row)) : null;
  if (row === undefined) return moveDates(dates, day, target.day);
  if (row === "all-day") return moveToAllDay(dates, day, target.day);
  return moveToTime(dates, day, target.day, at(row));
}

/**
 * The y of the dragged edge of what the pointer picked up: its top, or its bottom when the end
 * is dragged. Measured here because dnd-kit's own starting rect is the picture's, taken once it
 * has already moved with the pointer, which would put the drop a few minutes off.
 */
function pickedUpEdge({ target }: Event, grip: Grip): number {
  const item = target instanceof Element ? target.closest("li")?.getBoundingClientRect() : null;
  return (grip === "end" ? item?.bottom : item?.top) ?? 0;
}

function sameDates(a: DueDates, b: DueDates) {
  return (
    a.start_date === b.start_date &&
    a.start_time === b.start_time &&
    a.due_date === b.due_date &&
    a.due_time === b.due_time
  );
}

/**
 * Lets the Tasks inside be dragged: `DraggableTask` chips and `DraggableBlock`s onto the days and
 * slots that `useDropTarget` marks. A drop works out the Task's new dates and saves them, and a
 * failed save puts them back.
 */
export function CalendarDrag({ children }: { children: ReactNode }) {
  const sensors = useSensors(useSensor(MouseSensor, MOUSE), useSensor(TouchSensor, TOUCH));
  const [dragged, setDragged] = useState<Dragged | null>(null);
  const { mutate: reschedule } = useReschedule();

  const onDragStart = ({ active, activatorEvent }: DragStartEvent) => {
    const handle = handleOf(active);
    setDragged({ ...handle, edge: pickedUpEdge(activatorEvent, handle.grip) });
  };
  const onDragEnd = ({ over, delta }: DragEndEvent) => {
    setDragged(null);
    if (!dragged || !over) return;
    const { task } = dragged;
    if (task.due_date === null) return;
    const dates = { ...task, due_date: task.due_date };
    const edge = dragged.edge + delta.y;
    const at = (hour: number) => slotMinutes(hour, (edge - over.rect.top) / over.rect.height);
    const next = droppedDates(dates, dragged, targetOf(over), at);
    if (next && !sameDates(next, dates)) reschedule({ id: task.id, dates: next });
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setDragged(null);
      }}
    >
      {children}
      {createPortal(
        <DragOverlay dropAnimation={null}>{dragged && <Picture dragged={dragged} />}</DragOverlay>,
        document.body,
      )}
    </DndContext>
  );
}

/**
 * A picture of what is dragged, under the pointer; the Task itself stays where it was until the
 * drop. A resized block grows in place instead, so it has none.
 */
function Picture({ dragged: { task, grip } }: { dragged: Dragged }) {
  const span = timeSpan(task);
  if (grip === "end") return null;
  if (grip === "block" && span) {
    return (
      <ul aria-hidden inert className="relative h-full">
        <CalendarBlock block={{ task, span, column: 0, columns: 1 }} filling card={PICTURE} />
      </ul>
    );
  }
  return (
    <ul aria-hidden inert>
      <CalendarTask task={task} card={PICTURE} />
    </ul>
  );
}

/** The picture under the pointer is inert, so nothing can open or tick it. */
const PICTURE: CardProps = { tabbable: false, onOpen: () => undefined, onToggle: () => undefined };

/**
 * A Task's chip on one of its days that can be dragged to another day inside `CalendarDrag`. A
 * future Occurrence stays put: its date doesn't exist yet.
 */
export function DraggableTask({
  task,
  day,
  card,
}: {
  task: CalendarItem;
  day: string;
  card: CardProps;
}) {
  const { setNodeRef, listeners, isDragging } = useGrip(
    { task, day, grip: "chip" },
    task.occurrence,
  );
  const drag = { setNode: setNodeRef, listeners, dragging: isDragging };
  return <CalendarTask task={task} card={card} drag={task.occurrence ? undefined : drag} />;
}

/**
 * A timed Task's block in Week or Day mode inside `CalendarDrag`: dragged by its body to another
 * time or day, or by its bottom edge to change when it ends. A future Occurrence stays put.
 */
export function DraggableBlock({
  block,
  day,
  card,
}: {
  block: Block<CalendarItem>;
  day: string;
  card: CardProps;
}) {
  const { task } = block;
  const disabled = task.occurrence;
  const move = useGrip({ task, day, grip: "block" }, disabled);
  const {
    setNodeRef: setEdge,
    listeners: edgeListeners,
    transform,
  } = useGrip({ task, day, grip: "end" }, disabled);
  if (disabled) return <CalendarBlock block={block} card={card} />;
  return (
    <CalendarBlock
      block={block}
      card={card}
      drag={{ setNode: move.setNodeRef, listeners: move.listeners, dragging: move.isDragging }}
      stretch={transform?.y ?? 0}
      edge={
        // The mouse and touch way to set when it ends. Task detail's date picker is the keyboard
        // way, so the edge is hidden from assistive technology.
        <div
          ref={setEdge}
          {...edgeListeners}
          aria-hidden
          data-resize
          className="absolute inset-x-1 bottom-0 h-1.5 cursor-ns-resize touch-none"
        />
      }
    />
  );
}
