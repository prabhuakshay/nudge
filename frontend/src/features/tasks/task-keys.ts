import { useCallback } from "react";

import type { ShortcutHandlers } from "@/features/shortcuts/use-shortcuts";
import { useDeleteTask } from "@/features/trash/trash";

import { useSetTaskStatus, useUpdateTask, type Task, type TaskPriority } from "./tasks";

const PRIORITIES: readonly TaskPriority[] = [0, 1, 2, 3, 4];

/** A Task key that needs the drawer: a picker to open, or a field to edit. */
export type DetailAction = "setDate" | "addTag" | "moveToProject" | "markBlocked" | "editTitle";

/**
 * What a Task key does to a Task, wherever the Task has focus. `inDetail` does the keys that need
 * the drawer; `onDeleted` runs after Delete, so the drawer can close.
 */
export type TaskKeyTarget = {
  inDetail: (action: DetailAction) => void;
  onDeleted?: () => void;
};

/**
 * The Task keys (`0`–`4`, D, T, M, B, W, P, E/F2 and Delete) as shortcut handlers for one Task.
 * The same keys work on a focused row and in the open drawer.
 */
export function useTaskKeys() {
  const { mutate: update } = useUpdateTask();
  const { mutate: setStatus } = useSetTaskStatus();
  const { mutate: deleteTask } = useDeleteTask();

  return useCallback(
    (task: Task, { inDetail, onDeleted }: TaskKeyTarget): ShortcutHandlers => ({
      setPriority: (event) => {
        const priority = PRIORITIES.find((value) => String(value) === event.key);
        if (priority !== undefined) update({ id: task.id, priority });
      },
      markWontDo: () => {
        setStatus({ task, status: task.status === "wont_do" ? "open" : "wont_do" });
      },
      markBlocked: () => {
        if (task.status !== "blocked") setStatus({ task, status: "blocked" });
        inDetail("markBlocked");
      },
      // Only a root can be pinned: a Subtask shows under its parent.
      ...(task.parent_id === null && {
        togglePin: () => {
          update({ id: task.id, pinned: task.pinned_at === null });
        },
        moveToProject: () => {
          inDetail("moveToProject");
        },
      }),
      setDate: () => {
        inDetail("setDate");
      },
      addTag: () => {
        inDetail("addTag");
      },
      editTitle: () => {
        inDetail("editTitle");
      },
      deleteTask: () => {
        deleteTask(task);
        onDeleted?.();
      },
    }),
    [update, setStatus, deleteTask],
  );
}

let pending: { taskId: number; action: DetailAction } | null = null;

/** Ask the drawer to do `action` when it next shows this Task, as a row's D does. */
export function requestDetailAction(taskId: number, action: DetailAction) {
  pending = { taskId, action };
}

/** The action asked of the drawer for this Task, if any. */
export function requestedDetailAction(taskId: number): DetailAction | null {
  return pending?.taskId === taskId ? pending.action : null;
}

/** Forget the action asked of the drawer, once the drawer has read it. */
export function forgetDetailAction() {
  pending = null;
}
