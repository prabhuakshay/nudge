import {
  DndContext,
  DragOverlay,
  rectIntersection,
  type Announcements,
  type KeyboardCoordinateGetter,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { BoardCard, type BoardCardProps } from "@/features/projects/board-card";
import { DragPreview } from "@/features/projects/board-drag";
import { plainMentions } from "@/features/people/mentions";
import { useDragSensors, useSortableHandle } from "@/features/tasks/sortable-handle";
import { PRIORITY } from "@/features/tasks/task-properties";
import { useUpdateTask, type Task, type TaskPriority } from "@/features/tasks/tasks";
import { useMediaQuery } from "@/lib/use-media-query";

import { QUADRANT_LABEL, QUADRANTS, type MatrixQuadrants, type Quadrant } from "./quadrants";

/** Where each Quadrant sits: whether its row is Important and its column Urgent. */
const PLACE: Record<Quadrant, { important: boolean; urgent: boolean }> = {
  "urgent-important": { important: true, urgent: true },
  important: { important: true, urgent: false },
  urgent: { important: false, urgent: true },
  neither: { important: false, urgent: false },
};

/**
 * The Priority a Task dropped from one Quadrant into another takes: the smallest change that
 * moves it, P2 up into Important and P3 down out of it. Dates never change by dragging, so a drop
 * into the other urgency column, or into the same row, changes nothing.
 */
function droppedPriority(from: Quadrant, to: Quadrant): TaskPriority | null {
  if (PLACE[from].urgent !== PLACE[to].urgent || PLACE[from].important === PLACE[to].important) {
    return null;
  }
  return PLACE[to].important ? 2 : 3;
}

/** Which way each arrow key steps between Quadrants. */
const STEPS: Record<string, { x: number; y: number } | undefined> = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
};

/**
 * The arrow keys move a card into the Quadrant beside the one it is over, keeping its place within
 * it. Measured from the Quadrants rather than the card, which sits inset in its own Quadrant and
 * would otherwise count that Quadrant's neighbours in its own column as being to its left.
 */
const quadrantKeys: KeyboardCoordinateGetter = (
  event,
  { context: { over, droppableRects, collisionRect } },
) => {
  const step = STEPS[event.code];
  if (!step) return undefined;
  event.preventDefault();
  const here = over && droppableRects.get(over.id);
  if (!here || !collisionRect) return undefined;
  const next = [...droppableRects.values()].find(
    (rect) =>
      Math.sign(rect.left - here.left) === step.x && Math.sign(rect.top - here.top) === step.y,
  );
  if (!next) return undefined;
  return {
    x: collisionRect.left + next.left - here.left,
    y: collisionRect.top + next.top - here.top,
  };
};

const KEYBOARD = { coordinateGetter: quadrantKeys };

/** A card on the move: its Task and the Quadrant it was picked up from. */
type Dragged = { task: Task; from: Quadrant };

function draggedOf(quadrants: MatrixQuadrants, id: UniqueIdentifier): Dragged | null {
  for (const from of QUADRANTS) {
    const task = quadrants[from].find((each) => each.id === id);
    if (task) return { task, from };
  }
  return null;
}

/** Quadrants are the only drop targets, so whatever a card is over is one. */
function quadrantOfId(id: UniqueIdentifier | undefined): Quadrant | null {
  return QUADRANTS.find((quadrant) => quadrant === id) ?? null;
}

/** What screen readers hear while a card is dragged, in Task titles and Quadrant labels. */
function announcements(quadrants: MatrixQuadrants): Announcements {
  const said = (
    id: UniqueIdentifier,
    say: (title: string, dragged: Dragged) => string | undefined,
  ) => {
    const dragged = draggedOf(quadrants, id);
    return dragged ? say(`“${plainMentions(dragged.task.title)}”`, dragged) : undefined;
  };
  return {
    onDragStart: ({ active }) =>
      said(active.id, (title, { from }) => `Picked up ${title} from ${QUADRANT_LABEL[from]}.`),
    // Silent over its own Quadrant: a drag starts there, and "Picked up" has already said so.
    onDragOver: ({ active, over }) => {
      const to = quadrantOfId(over?.id);
      return said(active.id, (title, { from }) => {
        if (!to) return `${title} is over no Quadrant.`;
        if (to === from) return undefined;
        if (droppedPriority(from, to) === null) {
          return `${title} is over ${QUADRANT_LABEL[to]}, which only takes Tasks from above or below it.`;
        }
        return `${title} is over ${QUADRANT_LABEL[to]}.`;
      });
    },
    onDragEnd: ({ active, over }) =>
      said(active.id, (title, { from }) => {
        const to = quadrantOfId(over?.id);
        const priority = to && droppedPriority(from, to);
        if (!to || !priority) return `${title} stays in ${QUADRANT_LABEL[from]}.`;
        return `${title} moved to ${QUADRANT_LABEL[to]}, now ${PRIORITY[priority].long}.`;
      }),
    onDragCancel: ({ active }) =>
      said(active.id, (title, { from }) => `${title} stays in ${QUADRANT_LABEL[from]}.`),
  };
}

/**
 * Lets the Matrix's cards be dragged up and down between Quadrants with the mouse, touch or
 * keyboard, to change their Priority. `children` draws the Quadrants, told which one would take
 * the card if it dropped now. A refused drop, sideways or onto its own Quadrant, leaves the card
 * where it was; a failed save puts it back.
 */
export function MatrixDrag({
  quadrants,
  children,
}: {
  quadrants: MatrixQuadrants;
  children: (target: Quadrant | null) => ReactNode;
}) {
  const sensors = useDragSensors(KEYBOARD);
  const [dragged, setDragged] = useState<Dragged | null>(null);
  const [over, setOver] = useState<Quadrant | null>(null);
  const { mutate: update } = useUpdateTask();
  const target = dragged && over && droppedPriority(dragged.from, over) !== null ? over : null;

  const stop = () => {
    setDragged(null);
    setOver(null);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={rectIntersection}
      accessibility={{ announcements: announcements(quadrants) }}
      onDragStart={({ active }) => {
        setDragged(draggedOf(quadrants, active.id));
      }}
      onDragOver={({ over: next }) => {
        setOver(quadrantOfId(next?.id));
      }}
      onDragEnd={({ over: dropped }) => {
        stop();
        const to = quadrantOfId(dropped?.id);
        const priority = dragged && to && droppedPriority(dragged.from, to);
        if (dragged && priority) update({ id: dragged.task.id, priority });
      }}
      onDragCancel={stop}
    >
      {children(target)}
      {createPortal(
        <DragOverlay dropAnimation={null}>
          {dragged && <DragPreview title={plainMentions(dragged.task.title)} />}
        </DragOverlay>,
        document.body,
      )}
    </DndContext>
  );
}

/**
 * A Matrix card that drags: from anywhere on it after a 5 px mouse move, after a press and hold on
 * touch screens, or with Space or Enter on its grip from the keyboard. It takes the Board's
 * sortable handle, but nothing sorts: with no list around it, it stays put under the preview, and
 * it takes no drops itself.
 */
export function DraggableMatrixCard(props: Omit<BoardCardProps, "drag">) {
  const touch = useMediaQuery("(pointer: coarse)");
  const drag = useSortableHandle(props.card.task.id, { drags: true, takesDrops: false });
  return <BoardCard {...props} drag={{ ...drag, touch }} />;
}
