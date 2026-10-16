import {
  closestCenter,
  closestCorners,
  DndContext,
  DragOverlay,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { horizontalListSortingStrategy, SortableContext } from "@dnd-kit/sortable";
import { GripVertical } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { plainMentions } from "@/features/people/mentions";
import { useMoveSection, type Section } from "@/features/sections/sections";
import { useDragSensors, useSortableHandle } from "@/features/tasks/sortable-handle";
import { useMoveTask } from "@/features/tasks/task-placement";
import type { TreeRow } from "@/features/tasks/task-tree";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

import { BoardCard, type BoardCardProps } from "./board-card";
import type { BoardColumnCards } from "./board-column";
import {
  cardOf,
  columnId,
  draggedOver,
  droppedOn,
  isSectionColumn,
  placeOf,
  sectionMoveOf,
} from "./board-moves";

/** A card on the move, and the columns as they would be if it dropped now. */
type Dragging = { card: TreeRow; columns: BoardColumnCards[] };

/**
 * A dragged card lands on the nearest card or column. A dragged column only lands among the
 * Sections' columns, so nothing goes before No section.
 */
const boardCollisions: CollisionDetection = (args) =>
  isSectionColumn(args.active.id)
    ? closestCenter({
        ...args,
        droppableContainers: args.droppableContainers.filter(({ id }) => isSectionColumn(id)),
      })
    : closestCorners(args);

/**
 * Lets the Board's cards be dragged between and within columns, and its Sections' columns be
 * dragged left and right, with the mouse, touch or keyboard. While a card is dragged, `children`
 * draws the columns as they would be if it dropped there. On the drop the Task moves to that
 * column's Section, after the card above it, since Task order is one order across the Project; a
 * refused move puts it back. A dropped column's Section moves after the column now left of it.
 */
export function BoardDrag({
  projectId,
  columns,
  children,
}: {
  projectId: number;
  columns: BoardColumnCards[];
  /** Draws the columns, told whether a card is on the move. */
  children: (columns: BoardColumnCards[], cardDragged: boolean) => ReactNode;
}) {
  const sensors = useDragSensors();
  const [dragging, setDragging] = useState<Dragging | null>(null);
  const [draggedSection, setDraggedSection] = useState<Section | null>(null);
  const { mutate: move } = useMoveTask();
  const { mutate: moveSection } = useMoveSection(projectId);
  const sections = useMemo(() => columns.flatMap(({ section }) => section ?? []), [columns]);

  const onDragStart = ({ active }: DragStartEvent) => {
    const card = cardOf(columns, active.id);
    setDragging(card ? { card, columns } : null);
    setDraggedSection(sections.find((section) => columnId(section) === active.id) ?? null);
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
    setDraggedSection(null);
    if (!over) return;
    if (draggedSection) {
      const sectionMove = sectionMoveOf(sections, active.id, over.id);
      if (sectionMove) moveSection(sectionMove);
      return;
    }
    if (!dragging) return;
    const taskId = Number(active.id);
    const now = placeOf(columns, taskId);
    const next = placeOf(droppedOn(dragging.columns, active.id, over.id), taskId);
    if (now.sectionId === next.sectionId && now.afterId === next.afterId) return;
    move({ taskId, parentId: null, ...next });
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={boardCollisions}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setDragging(null);
        setDraggedSection(null);
      }}
    >
      <SortableContext items={sections.map(columnId)} strategy={horizontalListSortingStrategy}>
        {children(dragging?.columns ?? columns, dragging !== null)}
      </SortableContext>
      {createPortal(
        <DragOverlay dropAnimation={null}>
          {dragging && <DragPreview title={plainMentions(dragging.card.task.title)} />}
          {draggedSection && <DragPreview title={draggedSection.name} column />}
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
  const drag = useSortableHandle(props.card.task.id, {
    drags: !props.readOnly,
    takesDrops: !props.readOnly,
  });
  return <BoardCard {...props} drag={props.readOnly ? undefined : { ...drag, touch }} />;
}

/** What is under the pointer while dragging: a card's title, or a column header's name. */
export function DragPreview({ title, column = false }: { title: string; column?: boolean }) {
  return (
    <div
      className={cn(
        "flex w-72 items-center border border-primary/40 shadow-xl ring-2 ring-primary/15",
        column
          ? "gap-2 rounded-xl bg-surface-muted px-3 py-2.5"
          : "gap-2.5 rounded-lg bg-surface p-3",
      )}
    >
      <GripVertical className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</span>
    </div>
  );
}
