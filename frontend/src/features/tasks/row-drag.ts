import type { DragHandle } from "./sortable-tree";

/* How a table row starts a move: by drag from the whole row or its grip, or from the keyboard. */

/** A move from the keyboard: Tab, Shift+Tab, Alt+↑ and Alt+↓. */
export type KeyMove = "indent" | "outdent" | "up" | "down";
export type MoveByKey = (taskId: number, move: KeyMove) => void;

/**
 * Touch screens drag the whole row after a press and hold; mice after a 5 px move. The grip
 * carries the keyboard drag.
 */
export function rowActivator(handle: DragHandle | undefined, touch: boolean | undefined) {
  if (!handle) return {};
  return touch
    ? { ref: handle.setNode, onTouchStart: handle.onTouchStart }
    : { onPointerDown: handle.onPointerDown };
}
