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

import { CalendarTask } from "./calendar-task";
import { moveDates, useReschedule } from "./reschedule";

// Module constants, not inline objects: dnd-kit memoizes sensors on these options. A mouse drag
// starts after 5 px so a click still opens the Task; touch needs a press and hold so the page
// still scrolls. There is no keyboard drag: the arrow keys move between days, and Task detail's
// date picker is the keyboard way to reschedule.
const MOUSE = { activationConstraint: { distance: 5 } };
const TOUCH = { activationConstraint: { delay: 220, tolerance: 6 } };

/** A chip on the Calendar while it can be dragged: one per day it covers, so the day is in it. */
type Dragged = { task: Task; day: string };

function dragId({ task, day }: Dragged) {
  return `${day}/${String(task.id)}`;
}

/**
 * Lets the Tasks inside be dragged between days, each a `DraggableTask`, onto drop targets whose
 * id is the ISO day they stand for. A drop moves the Task's dates by the days between and saves
 * them, and a failed save puts them back.
 */
export function CalendarDrag({ tasks, children }: { tasks: readonly Task[]; children: ReactNode }) {
  const sensors = useSensors(useSensor(MouseSensor, MOUSE), useSensor(TouchSensor, TOUCH));
  const [dragged, setDragged] = useState<Dragged | null>(null);
  const { mutate: reschedule } = useReschedule();

  const onDragStart = ({ active }: DragStartEvent) => {
    const [day = "", id] = String(active.id).split("/");
    const task = tasks.find((each) => each.id === Number(id));
    setDragged(task ? { task, day } : null);
  };
  const onDragEnd = ({ over }: DragEndEvent) => {
    setDragged(null);
    const to = over && String(over.id);
    if (!dragged || !to || to === dragged.day) return;
    const { task, day: from } = dragged;
    if (task.due_date === null) return;
    reschedule({ id: task.id, dates: moveDates({ ...task, due_date: task.due_date }, from, to) });
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
        <DragOverlay dropAnimation={null}>
          {dragged && (
            // A picture of the chip under the pointer; the chip itself stays in its day.
            <ul aria-hidden inert>
              <CalendarTask task={dragged.task} tabbable={false} onOpen={noop} onToggle={noop} />
            </ul>
          )}
        </DragOverlay>,
        document.body,
      )}
    </DndContext>
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
  const { setNodeRef, listeners, isDragging } = useDraggable({ id: dragId({ task, day }) });
  return (
    <CalendarTask
      task={task}
      drag={{ setNode: setNodeRef, listeners, dragging: isDragging }}
      {...props}
    />
  );
}
