import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
  type DraggableAttributes,
  type DraggableSyntheticListeners,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import {
  memo,
  useMemo,
  useState,
  type PointerEventHandler,
  type ReactNode,
  type SyntheticEvent,
  type TouchEventHandler,
} from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

import { cn } from "@/lib/utils";

import {
  currentPlacement,
  projectDrop,
  TOO_DEEP,
  type Placement,
  type TreeBase,
} from "./task-drag";
import type { TreeRow } from "./task-tree";

/**
 * What starts a drag: a grip spreads every listener and the a11y attributes, while a whole row
 * takes just the mouse or the touch activator.
 */
export type DragHandle = {
  listeners: DraggableSyntheticListeners;
  attributes: DraggableAttributes;
  setNode: (node: HTMLElement | null) => void;
  onPointerDown: PointerEventHandler | undefined;
  onTouchStart: TouchEventHandler | undefined;
};

/** What a sortable row is drawn with: its place in the outline and its drag state. */
export type SortableRowProps = {
  row: TreeRow;
  /** The row's level, or while it's dragged, the level it would drop at. */
  level: number;
  handle: DragHandle;
  dragging: boolean;
};

// Module constants, not inline objects: dnd-kit memoizes sensors on these options, and new objects
// every render would rebuild every row's listeners and defeat the row memo while dragging.
const POINTER = { activationConstraint: { distance: 5 } };
const TOUCH = { activationConstraint: { delay: 220, tolerance: 6 } };
const KEYBOARD = { coordinateGetter: sortableKeyboardCoordinates };

/** The rows on show while one is dragged: its Subtasks travel with it, out of sight. */
function withoutSubtasksOf(rows: TreeRow[], activeId: number | null) {
  const start = rows.findIndex((row) => row.task.id === activeId);
  const active = rows[start];
  if (!active) return rows;
  const end = rows.findIndex((row, index) => index > start && row.level <= active.level);
  return [...rows.slice(0, start + 1), ...(end === -1 ? [] : rows.slice(end))];
}

/**
 * An outline of Tasks that sorts by dragging whole rows: up and down to reorder, sideways in
 * indent steps to change level. A drop that would break the depth limit is refused with a toast.
 * `renderRow` must be stable, so rows that don't move skip rendering while a drag is under way.
 */
export function SortableTree({
  rows: outline,
  base,
  indent,
  renderRow,
  onMove,
}: {
  rows: TreeRow[];
  base: TreeBase;
  indent: number;
  renderRow: (props: SortableRowProps) => ReactNode;
  onMove: (taskId: number, placement: Placement) => void;
}) {
  const [activeId, setActiveId] = useState<number | null>(null);
  const [overId, setOverId] = useState<number | null>(null);
  // Sideways drag in whole indent steps, not pixels, so the tree re-renders only when the level
  // it would drop at can change.
  const [step, setStep] = useState(0);
  const sensors = useSensors(
    useSensor(PointerSensor, POINTER),
    useSensor(TouchSensor, TOUCH),
    useSensor(KeyboardSensor, KEYBOARD),
  );
  const rows = useMemo(() => withoutSubtasksOf(outline, activeId), [outline, activeId]);
  const ids = useMemo(() => rows.map((row) => row.task.id), [rows]);
  const drop =
    activeId !== null && overId !== null ? projectDrop(rows, activeId, overId, step, base) : null;
  const active = rows.find((row) => row.task.id === activeId);

  const reset = () => {
    setActiveId(null);
    setOverId(null);
    setStep(0);
  };
  const onDragEnd = ({ active: dragged }: DragEndEvent) => {
    reset();
    if (!drop) return;
    if (!drop.valid) {
      toast.error(TOO_DEEP);
      return;
    }
    const taskId = Number(dragged.id);
    const now = currentPlacement(rows, taskId, base);
    if (now.parentId === drop.parentId && now.afterId === drop.afterId) return;
    onMove(taskId, { parentId: drop.parentId, afterId: drop.afterId });
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={({ active: dragged }: DragStartEvent) => {
        setActiveId(Number(dragged.id));
        setOverId(Number(dragged.id));
      }}
      onDragMove={({ delta }: DragMoveEvent) => {
        setStep(Math.round(delta.x / indent));
      }}
      onDragOver={({ over }: DragOverEvent) => {
        setOverId(over ? Number(over.id) : null);
      }}
      onDragEnd={onDragEnd}
      onDragCancel={reset}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {rows.map((row) => (
          <SortableRow
            key={row.task.id}
            row={row}
            level={row.task.id === activeId && drop ? drop.level : row.level}
            renderRow={renderRow}
          />
        ))}
      </SortableContext>
      {createPortal(
        <DragOverlay dropAnimation={null}>
          {active && <DragPreview row={active} invalid={drop ? !drop.valid : false} />}
        </DragOverlay>,
        document.body,
      )}
    </DndContext>
  );
}

/**
 * Only presses on the row itself start a drag: React also bubbles presses up from the menus and
 * pickers a row opens in portals.
 */
function ownPresses<E extends SyntheticEvent>(handler: ((event: E) => void) | undefined) {
  return (
    handler &&
    ((event: E) => {
      if (event.target instanceof Node && event.currentTarget.contains(event.target)) {
        handler(event);
      }
    })
  );
}

/** Moves with the drag on every sort step; the row inside renders only when its props change. */
function SortableRow({
  row,
  level,
  renderRow,
}: {
  row: TreeRow;
  level: number;
  renderRow: (props: SortableRowProps) => ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: row.task.id });
  const handle = useMemo<DragHandle>(
    () => ({
      listeners,
      attributes,
      setNode: setActivatorNodeRef,
      // dnd-kit types listeners as bare Functions keyed by event; these are the pointer and touch
      // sensors' React handlers.
      onPointerDown: ownPresses(listeners?.["onPointerDown"] as PointerEventHandler | undefined),
      onTouchStart: ownPresses(listeners?.["onTouchStart"] as TouchEventHandler | undefined),
    }),
    [listeners, attributes, setActivatorNodeRef],
  );
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }}>
      <RowContent
        renderRow={renderRow}
        row={row}
        level={level}
        handle={handle}
        dragging={isDragging}
      />
    </div>
  );
}

const RowContent = memo(function RowContent({
  renderRow,
  ...props
}: SortableRowProps & { renderRow: (props: SortableRowProps) => ReactNode }) {
  return renderRow(props);
});

/** The card under the pointer while dragging: the Task, what it carries, and a refusal. */
function DragPreview({ row, invalid }: { row: TreeRow; invalid: boolean }) {
  return (
    <div
      className={cn(
        "flex h-11 w-[min(30rem,90vw)] items-center gap-2.5 rounded-lg border bg-surface px-3 shadow-xl",
        invalid
          ? "border-danger ring-2 ring-danger/20"
          : "border-primary/40 ring-2 ring-primary/15",
      )}
    >
      <GripVertical className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{row.task.title}</span>
      {row.carried > 0 && (
        <span className="rounded-full bg-surface-muted px-1.5 py-px text-[11px] font-medium text-muted-foreground">
          +{row.carried} {row.carried === 1 ? "Subtask" : "Subtasks"}
        </span>
      )}
      {invalid && <span className="text-[11px] font-semibold text-danger">Too deep</span>}
    </div>
  );
}
