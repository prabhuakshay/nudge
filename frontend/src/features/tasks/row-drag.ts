import type { KeyboardEvent } from "react";

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

/**
 * Enter opens a focused row; Tab, Shift+Tab and Alt+↑/↓ move it where rows can move; Delete and
 * Backspace send it to Trash where it can change.
 */
export function rowKeyDown(
  event: KeyboardEvent,
  taskId: number,
  onOpen: (taskId: number) => void,
  onMoveByKey: MoveByKey | undefined,
  onDelete: (() => void) | undefined,
) {
  if (event.target !== event.currentTarget) return;
  const move = onMoveByKey && keyMove(event);
  if (move) onMoveByKey(taskId, move);
  else if (event.key === "Enter") onOpen(taskId);
  else if (onDelete && (event.key === "Delete" || event.key === "Backspace")) onDelete();
  else return;
  event.preventDefault();
}

function keyMove(event: KeyboardEvent): KeyMove | null {
  if (event.key === "Tab") return event.shiftKey ? "outdent" : "indent";
  if (event.altKey && event.key === "ArrowUp") return "up";
  if (event.altKey && event.key === "ArrowDown") return "down";
  return null;
}
