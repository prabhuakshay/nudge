import { useCallback, useMemo } from "react";

import { useMediaQuery } from "@/lib/use-media-query";

import { useOpenTask } from "./open-task";
import { isClosed } from "./task-properties";
import type { RowContext, ToggleCollapsed, ToggleStatus } from "./task-row";
import { useSetTaskStatus } from "./tasks";

/** How far each level of Subtasks steps in, in pixels; nesting eats width, so less on phones. */
const INDENT = 22;
const PHONE_INDENT = 20;

/**
 * What a list's rows share: the open Task, folding, indent and the row actions. Stable between
 * renders, so memoized rows don't re-render when the list does.
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
  const indent = useMediaQuery("(min-width: 1024px)") ? INDENT : PHONE_INDENT;
  const touch = useMediaQuery("(pointer: coarse)");
  const { mutate: setStatus } = useSetTaskStatus();
  const toggle = useCallback<ToggleStatus>(
    (task) => {
      setStatus({ task, status: isClosed(task.status) ? "open" : "completed" });
    },
    [setStatus],
  );
  return useMemo<RowContext>(
    () => ({
      openId,
      collapsed,
      indent,
      contextMenu: !touch && !readOnly,
      onToggle: toggle,
      onOpen: setOpenTask,
      onToggleCollapsed,
    }),
    [openId, collapsed, indent, touch, readOnly, toggle, setOpenTask, onToggleCollapsed],
  );
}
