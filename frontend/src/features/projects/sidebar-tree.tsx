import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMemo, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

import type { SidebarItem } from "./projects";
import { useSidebarSensors } from "./sidebar-drag";
import {
  dropPlacement,
  flattenSidebar,
  type Placement,
  type SidebarRow,
  type SiblingRef,
} from "./sidebar-order";

/** How far a Project in a Folder is indented, and how far to drag sideways to change level. */
const INDENT = 16;

/** What a row renders, with the props that make it draggable already applied to its wrapper. */
export type RenderRow = (row: SidebarRow) => ReactNode;

/**
 * The sidebar's Folders and Projects as one sortable list. Dragging up and down reorders;
 * dragging sideways at the edge of a Folder moves a Project in or out of it.
 */
export function SidebarTree({
  items,
  renderRow,
  onMove,
}: {
  items: SidebarItem[];
  renderRow: RenderRow;
  onMove: (moving: SiblingRef, placement: Placement) => void;
}) {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  // Sideways drag in whole indents, so pointer moves re-render only when the level can change.
  const [steps, setSteps] = useState(0);
  const justDropped = useRef(false);
  const sensors = useSidebarSensors();

  const draggedFolder = activeKey?.startsWith("folder-") ? Number(activeKey.slice(7)) : undefined;
  const rows = useMemo(() => flattenSidebar(items, draggedFolder), [items, draggedFolder]);
  const keys = useMemo(() => rows.map((row) => row.key), [rows]);
  const placement =
    activeKey && overKey ? dropPlacement(rows, activeKey, overKey, steps) : undefined;

  const reset = () => {
    setActiveKey(null);
    setOverKey(null);
    setSteps(0);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={({ active }: DragStartEvent) => {
        setActiveKey(String(active.id));
        setOverKey(String(active.id));
      }}
      onDragMove={({ delta }: DragMoveEvent) => {
        setSteps(Math.round(delta.x / INDENT));
      }}
      onDragOver={({ over }: DragOverEvent) => {
        setOverKey(over ? String(over.id) : null);
      }}
      onDragEnd={({ active, over, activatorEvent }: DragEndEvent) => {
        const row = rows.find((candidate) => candidate.key === active.id);
        const target = over && dropPlacement(rows, String(active.id), String(over.id), steps);
        reset();
        // A pointer drop ends with a click on the dragged row, which would follow its link.
        justDropped.current = !(activatorEvent instanceof KeyboardEvent);
        if (row && target) onMove({ kind: row.item.kind, id: row.item.id }, target);
      }}
      onDragCancel={reset}
    >
      <SortableContext items={keys} strategy={verticalListSortingStrategy}>
        <ul
          className="flex flex-col gap-px"
          onClickCapture={(event) => {
            if (!justDropped.current) return;
            justDropped.current = false;
            event.preventDefault();
            event.stopPropagation();
          }}
          onPointerDownCapture={() => {
            justDropped.current = false;
          }}
        >
          {rows.map((row) => (
            <SortableRow
              key={row.key}
              row={row}
              depth={row.key === activeKey && placement ? (placement.folderId ? 1 : 0) : row.depth}
              invalid={row.key === activeKey && placement === null}
              renderRow={renderRow}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({
  row,
  depth,
  invalid,
  renderRow,
}: {
  row: SidebarRow;
  depth: number;
  invalid: boolean;
  renderRow: RenderRow;
}) {
  const { setNodeRef, listeners, attributes, transform, transition, isDragging } = useSortable({
    id: row.key,
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      // Only the listeners and the instructions: dnd-kit's other attributes would turn every
      // Project link into a button for assistive tech.
      {...listeners}
      aria-describedby={attributes["aria-describedby"]}
      className={cn(
        "relative touch-manipulation select-none [-webkit-touch-callout:none]",
        depth === 1 && "pl-4",
        isDragging && "z-10 rounded-md bg-surface opacity-90 shadow-lg",
        invalid && "opacity-50",
      )}
    >
      {renderRow(row)}
    </li>
  );
}
