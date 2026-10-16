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
  type UniqueIdentifier,
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
  Fragment,
  memo,
  useMemo,
  useState,
  type CSSProperties,
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
  groupedDrop,
  TOO_DEEP,
  type Placement,
  type RowGroup,
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
};

// Module constants, not inline objects: dnd-kit memoizes sensors on these options, and new objects
// every render would rebuild every row's listeners and defeat the row memo while dragging.
const POINTER = { activationConstraint: { distance: 5 } };
const TOUCH = { activationConstraint: { delay: 220, tolerance: 6 } };
const KEYBOARD = { coordinateGetter: sortableKeyboardCoordinates };

/** What a group's header takes so dragged rows can pass it, and so it makes way for them. */
export type GroupHeader = {
  setNode: (node: HTMLElement | null) => void;
  style: CSSProperties;
};

/**
 * Draws one group: its `rows`, under its `header` when it has one. Every group after the first
 * has a header; dragging a row past it moves the row into that group.
 */
export type RenderGroup = (index: number, header: GroupHeader | null, rows: ReactNode) => ReactNode;

const justRows: RenderGroup = (_index, _header, rows) => rows;

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
 * indent steps to change level. The outline may be split into groups that rows are dragged
 * between, drawn by `renderGroup`; `onMove` gets the index of the group the row lands in. A drop
 * that would break the depth limit is refused with a toast. `renderRow` must be stable, so rows
 * that don't move skip rendering while a drag is under way.
 */
export function SortableTree({
  groups: outline,
  base,
  indent,
  renderRow,
  renderGroup = justRows,
  onMove,
  disabled = false,
}: {
  groups: RowGroup[];
  base: TreeBase;
  indent: number;
  renderRow: (props: SortableRowProps) => ReactNode;
  renderGroup?: RenderGroup;
  onMove: (taskId: number, placement: Placement, group: number) => void;
  /** Rows that can't change, as in an archived Project, don't drag. */
  disabled?: boolean;
}) {
  const [activeId, setActiveId] = useState<number | null>(null);
  const [overId, setOverId] = useState<UniqueIdentifier | null>(null);
  // Sideways drag in whole indent steps, not pixels, so the tree re-renders only when the level
  // it would drop at can change.
  const [step, setStep] = useState(0);
  const sensors = useSensors(
    useSensor(PointerSensor, POINTER),
    useSensor(TouchSensor, TOUCH),
    useSensor(KeyboardSensor, KEYBOARD),
  );
  const groups = useMemo(
    () => outline.map((group) => ({ ...group, rows: withoutSubtasksOf(group.rows, activeId) })),
    [outline, activeId],
  );
  const ids = useMemo(
    () =>
      groups.flatMap<UniqueIdentifier>(({ id, rows }, index) => [
        ...(index === 0 ? [] : [id]),
        ...rows.map((row) => row.task.id),
      ]),
    [groups],
  );
  const drop =
    activeId !== null && overId !== null ? groupedDrop(groups, activeId, overId, step, base) : null;
  const from = groups.findIndex(({ rows }) => rows.some((row) => row.task.id === activeId));
  const active = groups[from]?.rows.find((row) => row.task.id === activeId);

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
    const now = currentPlacement(groups[from]?.rows ?? [], taskId, base);
    const unmoved =
      drop.group === from && now.parentId === drop.parentId && now.afterId === drop.afterId;
    if (unmoved) return;
    onMove(taskId, { parentId: drop.parentId, afterId: drop.afterId }, drop.group);
  };
  const sortableRows = (rows: TreeRow[]) =>
    rows.map((row) => (
      <SortableRow
        key={row.task.id}
        row={row}
        level={row.task.id === activeId && drop ? drop.level : row.level}
        renderRow={renderRow}
        disabled={disabled}
      />
    ));

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
        setOverId(over ? over.id : null);
      }}
      onDragEnd={onDragEnd}
      onDragCancel={reset}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {groups.map(({ id, rows }, index) =>
          index === 0 ? (
            <Fragment key={id}>{renderGroup(index, null, sortableRows(rows))}</Fragment>
          ) : (
            <SortableHeader key={id} id={id}>
              {(header) => renderGroup(index, header, sortableRows(rows))}
            </SortableHeader>
          ),
        )}
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

/** A group's header, which never drags itself but makes way for the rows dragged past it. */
function SortableHeader({
  id,
  children,
}: {
  id: string;
  children: (header: GroupHeader) => ReactNode;
}) {
  const { setNodeRef, transform, transition } = useSortable({
    id,
    disabled: { draggable: true, droppable: false },
  });
  return children({
    setNode: setNodeRef,
    style: { transform: CSS.Translate.toString(transform), transition },
  });
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
  disabled,
}: {
  row: TreeRow;
  level: number;
  renderRow: (props: SortableRowProps) => ReactNode;
  disabled: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: row.task.id, disabled });
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
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(isDragging && "opacity-40")}
    >
      <RowContent renderRow={renderRow} row={row} level={level} handle={handle} />
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
