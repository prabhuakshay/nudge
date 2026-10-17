import { useCallback, type KeyboardEvent } from "react";

import {
  runShortcut,
  useSingleKeyShortcuts,
  type ShortcutHandlers,
} from "@/features/shortcuts/use-shortcuts";

import type { MoveByKey } from "./row-drag";
import type { Task } from "./tasks";
import { useTaskVerbs, verbShortcuts } from "./use-task-verbs";

/** A focused row's key handler; `onMoveByKey` is left out where rows don't move. */
export type RowKeyDown = (
  event: KeyboardEvent<HTMLElement>,
  task: Task,
  onMoveByKey?: MoveByKey,
) => void;

/** Focus the row `step` rows after this one in its table, if there is one, and return it. */
function focusRow(row: HTMLElement, step: number) {
  const table = row.closest("[role=treegrid]") ?? document;
  const rows = Array.from(table.querySelectorAll<HTMLElement>("[role=row][data-task-id]"));
  const target = rows[rows.indexOf(row) + step];
  target?.focus();
  return target;
}

/**
 * The keys of a focused row: ↑/↓ (or K/J) move between rows, Tab, Shift+Tab and Alt+↑/↓ move it
 * where rows move, and the keys of the Task's verbs, such as Enter, Space and W, run them.
 * Verbs that need the drawer, such as D for the date, open it and do it there. Where Tasks
 * can't change, in an archived Project, rows only move focus and open. Given `onSelectRange`,
 * Shift+↑/↓ select the row above or below as well, and move to it.
 */
export function useRowKeyDown({
  readOnly,
  onOpen,
  onSelectRange,
}: {
  readOnly: boolean;
  onOpen: (taskId: number) => void;
  onSelectRange?: (from: number, to: number) => void;
}): RowKeyDown {
  const singleKey = useSingleKeyShortcuts();
  const taskVerbs = useTaskVerbs();
  return useCallback<RowKeyDown>(
    (event, task, onMoveByKey) => {
      // Keys on a cell's picker button are the button's.
      if (event.target !== event.currentTarget) return;
      const row = event.currentTarget;
      const move = (direction: Parameters<MoveByKey>[1]) => () => {
        onMoveByKey?.(task.id, direction);
      };
      const selectTo = (step: number) => () => {
        const target = focusRow(row, step);
        if (target) onSelectRange?.(task.id, Number(target.dataset["taskId"]));
      };
      const handlers: ShortcutHandlers = {
        ...(onSelectRange && { selectUp: selectTo(-1), selectDown: selectTo(1) }),
        nextRow: () => {
          focusRow(row, 1);
        },
        previousRow: () => {
          focusRow(row, -1);
        },
        ...(onMoveByKey && {
          indent: move("indent"),
          outdent: move("outdent"),
          moveUp: move("up"),
          moveDown: move("down"),
        }),
        ...verbShortcuts(taskVerbs(task, { readOnly, inDrawer: false }, { onOpen })),
      };
      runShortcut(event.nativeEvent, handlers, singleKey);
    },
    [readOnly, onOpen, onSelectRange, singleKey, taskVerbs],
  );
}
