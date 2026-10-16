import {
  closestCorners,
  DndContext,
  DragOverlay,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { GripVertical } from "lucide-react";
import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { plainMentions } from "@/features/people/mentions";
import { useDragSensors, useSortableHandle } from "@/features/tasks/sortable-handle";
import { useMoveTask } from "@/features/tasks/task-placement";
import type { TreeRow } from "@/features/tasks/task-tree";
import { useMediaQuery } from "@/lib/use-media-query";

import { BoardCard, type BoardCardProps } from "./board-card";
import type { BoardColumnCards } from "./board-column";
import { cardOf, draggedOver, droppedOn, placeOf } from "./board-moves";

/** A card on the move, and the columns as they would be if it dropped now. */
type Dragging = { card: TreeRow; columns: BoardColumnCards[] };

/**
 * Lets the Board's cards be dragged between and within columns with the mouse, touch or keyboard.
 * While a card is dragged, `children` draws the columns as they would be if it dropped there. On
 * the drop the Task moves to that column's Section, after the card above it, since Task order is
 * one order across the Project; a refused move puts it back.
 */
export function BoardDrag({
  columns,
  children,
}: {
  columns: BoardColumnCards[];
  children: (columns: BoardColumnCards[]) => ReactNode;
}) {
  const sensors = useDragSensors();
  const [dragging, setDragging] = useState<Dragging | null>(null);
  const { mutate: move } = useMoveTask();

  const onDragStart = ({ active }: DragStartEvent) => {
    const card = cardOf(columns, active.id);
    setDragging(card ? { card, columns } : null);
  };
  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    const dragged = active.rect.current.translated;
    const below = dragged !== null && dragged.top > over.rect.top + over.rect.height / 2;
    setDragging(
      (current) =>
        current && { ...current, columns: draggedOver(current.columns, active.id, over.id, below) },
    );
  };
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(null);
    if (!dragging || !over) return;
    const taskId = Number(active.id);
    const now = placeOf(columns, taskId);
    const next = placeOf(droppedOn(dragging.columns, active.id, over.id), taskId);
    if (now.sectionId === next.sectionId && now.afterId === next.afterId) return;
    move({ taskId, parentId: null, ...next });
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setDragging(null);
      }}
    >
      {children(dragging?.columns ?? columns)}
      {createPortal(
        <DragOverlay dropAnimation={null}>
          {dragging && <CardPreview card={dragging.card} />}
        </DragOverlay>,
        document.body,
      )}
    </DndContext>
  );
}

/**
 * A card that drags: from anywhere on it after a 5 px mouse move, after a press and hold on touch
 * screens, or with Space or Enter on its grip from the keyboard. A read-only card stays put.
 */
export function SortableBoardCard(props: Omit<BoardCardProps, "drag">) {
  const touch = useMediaQuery("(pointer: coarse)");
  const drag = useSortableHandle(props.card.task.id, props.readOnly);
  return <BoardCard {...props} drag={props.readOnly ? undefined : { ...drag, touch }} />;
}

/** The card under the pointer while dragging. */
function CardPreview({ card: { task } }: { card: TreeRow }) {
  return (
    <div className="flex w-72 items-center gap-2.5 rounded-lg border border-primary/40 bg-surface p-3 shadow-xl ring-2 ring-primary/15">
      <GripVertical className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-sm font-semibold">
        {plainMentions(task.title)}
      </span>
    </div>
  );
}
