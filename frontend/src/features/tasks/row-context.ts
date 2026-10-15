import { useCallback, useMemo, useState } from "react";

import { useMediaQuery } from "@/lib/use-media-query";

import { useOpenTask } from "./open-task";
import { useRowKeyDown } from "./row-keys";
import { NO_SELECTION, selectRange, toggleSelected } from "./selection";
import { isClosed } from "./task-properties";
import type { RowContext, SelectTask, ToggleCollapsed, ToggleStatus } from "./task-row";
import { useSetTaskStatus } from "./tasks";

/** How far each level of Subtasks steps in, in pixels; nesting eats width, so less on phones. */
const INDENT = 22;
const PHONE_INDENT = 20;

/** The ids of the list's rows as they show, top to bottom, for Shift ranges. */
function rowOrder() {
  const rows = document.querySelectorAll<HTMLElement>("[role=treegrid] [role=row][data-task-id]");
  return Array.from(rows, (row) => Number(row.dataset["taskId"]));
}

/**
 * What a list's rows share: the open Task, folding, indent, the selection and the row actions.
 * Stable between renders, so memoized rows don't re-render when the list does. From `lg`,
 * Shift/Mod-click and Shift+↑/↓ select rows; selecting closes the drawer and opening a Task
 * clears the selection, so the two never show at once.
 */
export function useRowContext({
  collapsed,
  onToggleCollapsed,
  readOnly = false,
}: {
  collapsed: ReadonlySet<number>;
  onToggleCollapsed: ToggleCollapsed;
  readOnly?: boolean;
}): RowContext {
  const { openTaskId: openId, setOpenTask } = useOpenTask();
  const wide = useMediaQuery("(min-width: 1024px)");
  const touch = useMediaQuery("(pointer: coarse)");
  const { mutate: setStatus } = useSetTaskStatus();
  const [selection, setSelection] = useState(NO_SELECTION);
  const toggle = useCallback<ToggleStatus>(
    (task) => {
      setStatus({ task, status: isClosed(task.status) ? "open" : "completed" });
    },
    [setStatus],
  );
  const open = useCallback(
    (taskId: number) => {
      setSelection(NO_SELECTION);
      setOpenTask(taskId);
    },
    [setOpenTask],
  );
  const selectFromTo = useCallback(
    (from: number, to: number) => {
      if (openId !== null) setOpenTask(null);
      setSelection((current) => selectRange(current, from, to, rowOrder()));
    },
    [openId, setOpenTask],
  );
  const select = useCallback<SelectTask>(
    (taskId, how) => {
      if (how === "range") {
        selectFromTo(openId ?? taskId, taskId);
        return;
      }
      if (openId !== null) setOpenTask(null);
      setSelection((current) => toggleSelected(current, taskId));
    },
    [openId, setOpenTask, selectFromTo],
  );
  const clearSelection = useCallback(() => {
    setSelection(NO_SELECTION);
  }, []);
  const multiSelect = wide && !readOnly;
  const onKeyDown = useRowKeyDown({
    readOnly,
    onOpen: open,
    onToggle: toggle,
    ...(multiSelect && { onSelectRange: selectFromTo }),
  });
  return useMemo<RowContext>(
    () => ({
      openId,
      selectedIds: selection.ids,
      collapsed,
      indent: wide ? INDENT : PHONE_INDENT,
      contextMenu: !touch && !readOnly,
      onToggle: toggle,
      onOpen: open,
      ...(multiSelect && { onSelect: select }),
      clearSelection,
      onToggleCollapsed,
      onKeyDown,
    }),
    [
      openId,
      selection.ids,
      collapsed,
      wide,
      touch,
      readOnly,
      toggle,
      open,
      multiSelect,
      select,
      clearSelection,
      onToggleCollapsed,
      onKeyDown,
    ],
  );
}
