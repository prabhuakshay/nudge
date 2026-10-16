import {
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  useMemo,
  type PointerEventHandler,
  type SyntheticEvent,
  type TouchEventHandler,
} from "react";

import type { DragHandle } from "./sortable-tree";

/* The sensors and drag handles every sortable list of Tasks drags with. */

// Module constants, not inline objects: dnd-kit memoizes sensors on these options, and new objects
// every render would rebuild every row's listeners and defeat the row memo while dragging.
const POINTER = { activationConstraint: { distance: 5 } };
const TOUCH = { activationConstraint: { delay: 220, tolerance: 6 } };
const KEYBOARD = { coordinateGetter: sortableKeyboardCoordinates };

/** Drags start after a 5 px mouse move, a press and hold on touch, or Space or Enter on a grip. */
export function useDragSensors() {
  return useSensors(
    useSensor(PointerSensor, POINTER),
    useSensor(TouchSensor, TOUCH),
    useSensor(KeyboardSensor, KEYBOARD),
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

/**
 * What a sortable item drags with: the handle that starts the drag, and the node and style that
 * move with it.
 */
export function useSortableHandle(id: UniqueIdentifier, disabled: boolean) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });
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
  const style = { transform: CSS.Translate.toString(transform), transition };
  return { handle, setNode: setNodeRef, style, isDragging };
}
