import {
  DndContext,
  DragOverlay,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import type { Task } from "@/features/tasks/tasks";

import { CalendarBlock } from "./calendar-block";
import { CalendarTask } from "./calendar-task";
import { timeSpan, type Block, type Row } from "./layout";
import {
  moveDates,
  moveToAllDay,
  moveToTime,
  resizeEnd,
  slotMinutes,
  useReschedule,
  type DueDates,
} from "./reschedule";

// Module constants, not inline objects: dnd-kit memoizes sensors on these options. A mouse drag
// starts after 5 px so a click still opens the Task; touch needs a press and hold so the page
// still scrolls. There is no keyboard drag: the arrow keys move between days, and Task detail's
// date picker is the keyboard way to reschedule.
const MOUSE = { activationConstraint: { distance: 5 } };
const TOUCH = { activationConstraint: { delay: 220, tolerance: 6 } };

/** What is dragged: a Month or all-day chip, a Week or Day block, or a block's bottom edge. */
type Grip = "chip" | "block" | "end";

/** A Task's grip on the Calendar: one per day it covers, so the day is in it. */
type Handle = { task: Task; day: string; grip: Grip };

/** A Task while it is dragged, with the y of its dragged edge when it was picked up. */
type Dragged = Handle & { edge: number };

function dragId({ task, day, grip }: Handle) {
  return `${day}/${String(task.id)}/${grip}`;
}

/** Where a drop lands: a Month day, or a Week or Day slot. */
type Target = { day: string; row?: Row };

/** The slot or day a drop target id from `slotTarget`, or a Month day's ISO date, stands for. */
function targetOf(id: string): Target {
  const [day = "", row] = id.split("@");
  if (row === undefined) return { day };
  return { day, row: row === "all-day" ? row : Number(row) };
}

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

/** The Task and grip a draggable id from `dragId` stands for. */
function handleOf(id: string, tasks: readonly Task[]): Handle | null {
  const [day = "", taskId, part] = id.split("/");
  const grip: Grip = part === "block" || part === "end" ? part : "chip";
  const task = tasks.find((each) => each.id === Number(taskId));
  return task ? { task, day, grip } : null;
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
 * Lets the Tasks inside be dragged: `DraggableTask` chips onto Month days, whose drop target id
 * is the ISO day, and chips and `DraggableBlock`s onto Week and Day slots, whose id comes from
 * `slotTarget`. A drop works out the Task's new dates and saves them, and a failed save puts
 * them back.
 */
export function CalendarDrag({ tasks, children }: { tasks: readonly Task[]; children: ReactNode }) {
  const sensors = useSensors(useSensor(MouseSensor, MOUSE), useSensor(TouchSensor, TOUCH));
  const [dragged, setDragged] = useState<Dragged | null>(null);
  const { mutate: reschedule } = useReschedule();

  const onDragStart = ({ active, activatorEvent }: DragStartEvent) => {
    const handle = handleOf(String(active.id), tasks);
    setDragged(handle && { ...handle, edge: pickedUpEdge(activatorEvent, handle.grip) });
  };
  const onDragEnd = ({ over, delta }: DragEndEvent) => {
    setDragged(null);
    if (!dragged || !over) return;
    const { task } = dragged;
    if (task.due_date === null) return;
    const dates = { ...task, due_date: task.due_date };
    const edge = dragged.edge + delta.y;
    const at = (hour: number) => slotMinutes(hour, (edge - over.rect.top) / over.rect.height);
    const next = droppedDates(dates, dragged, targetOf(String(over.id)), at);
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
        <CalendarBlock
          block={{ task, span, column: 0, columns: 1 }}
          filling
          tabbable={false}
          onOpen={noop}
          onToggle={noop}
        />
      </ul>
    );
  }
  return (
    <ul aria-hidden inert>
      <CalendarTask task={task} tabbable={false} onOpen={noop} onToggle={noop} />
    </ul>
  );
}

function noop() {
  // The picture under the pointer can't be clicked.
}

/** A Task's chip on one of its days that can be dragged to another day inside `CalendarDrag`. */
export function DraggableTask({
  task,
  day,
  ...props
}: {
  task: Task;
  day: string;
  tabbable: boolean;
  onOpen: (taskId: number) => void;
  onToggle: (task: Task) => void;
}) {
  const { setNodeRef, listeners, isDragging } = useDraggable({
    id: dragId({ task, day, grip: "chip" }),
  });
  return (
    <CalendarTask
      task={task}
      drag={{ setNode: setNodeRef, listeners, dragging: isDragging }}
      {...props}
    />
  );
}

/**
 * A timed Task's block in Week or Day mode inside `CalendarDrag`: dragged by its body to another
 * time or day, or by its bottom edge to change when it ends.
 */
export function DraggableBlock({
  block,
  day,
  ...props
}: {
  block: Block<Task>;
  day: string;
  tabbable: boolean;
  onOpen: (taskId: number) => void;
  onToggle: (task: Task) => void;
}) {
  const { task } = block;
  const move = useDraggable({ id: dragId({ task, day, grip: "block" }) });
  const {
    setNodeRef: setEdge,
    listeners: edgeListeners,
    transform,
  } = useDraggable({ id: dragId({ task, day, grip: "end" }) });
  return (
    <CalendarBlock
      block={block}
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
      {...props}
    />
  );
}
