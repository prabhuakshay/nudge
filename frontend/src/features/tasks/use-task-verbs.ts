import { useCallback } from "react";
import { toast } from "sonner";

import { matchingBinding } from "@/features/shortcuts/registry";
import type { ShortcutHandlers } from "@/features/shortcuts/use-shortcuts";

import { requestDetailVerb } from "./detail-verbs";
import { useSetOpenTask, useTaskLink } from "./open-task";
import { useDuplicateTask } from "./task-placement";
import {
  completionToggled,
  taskVerbs,
  wontDoToggled,
  type DetailVerbId,
  type TaskPlace,
  type TaskVerb,
  type TaskVerbId,
} from "./task-verbs";
import { useUpdateTask, type Task } from "./tasks";
import { useUndoableTaskChanges } from "./task-undo";

/** A Task verb with what it does. */
export type RunnableTaskVerb = TaskVerb & { run: () => void };

/** What the place that shows a Task does around its verbs. */
export type TaskVerbTarget = {
  /** Opens a Task in the drawer; the drawer's own by default. */
  onOpen?: (taskId: number) => void;
  /** Runs after Delete, so the drawer can close. */
  onDeleted?: () => void;
};

async function copyLink(link: string) {
  try {
    await navigator.clipboard.writeText(link);
    toast("Link copied");
  } catch {
    toast.error("Could not copy the link.");
  }
}

/** Complete a Task, or reopen it when it is Closed, then offer Undo. */
export function useToggleComplete() {
  const { setStatus } = useUndoableTaskChanges();
  return useCallback(
    (task: Task) => {
      setStatus([task], completionToggled(task.status));
    },
    [setStatus],
  );
}

/**
 * The verbs available on a Task in a place, each ready to run. Returns a function, so one list's
 * key handler can ask for whichever row has focus.
 */
export function useTaskVerbs() {
  const { mutate: update } = useUpdateTask();
  const { setStatus, setPriority, remove } = useUndoableTaskChanges();
  const { mutate: duplicate } = useDuplicateTask();
  const toggleComplete = useToggleComplete();
  const taskLink = useTaskLink();
  const setOpenTask = useSetOpenTask();

  return useCallback(
    (task: Task, place: TaskPlace, target: TaskVerbTarget = {}): RunnableTaskVerb[] => {
      const { onOpen = setOpenTask, onDeleted } = target;
      const inDetail = (verb: DetailVerbId) => () => {
        requestDetailVerb(task.id, verb);
        onOpen(task.id);
      };
      const runs: Record<Exclude<TaskVerbId, "setPriority">, () => void> = {
        openTask: () => {
          onOpen(task.id);
        },
        completeTask: () => {
          toggleComplete(task);
        },
        setDate: inDetail("setDate"),
        addTag: inDetail("addTag"),
        moveToProject: inDetail("moveToProject"),
        markBlocked: () => {
          if (task.status !== "blocked") setStatus([task], "blocked");
          inDetail("markBlocked")();
        },
        editTitle: inDetail("editTitle"),
        markWontDo: () => {
          setStatus([task], wontDoToggled(task.status));
        },
        togglePin: () => {
          update({ id: task.id, pinned: task.pinned_at === null });
        },
        duplicateTask: () => {
          duplicate(task.id);
        },
        copyLink: () => void copyLink(taskLink(task.id)),
        deleteTask: () => {
          remove([task]);
          onDeleted?.();
        },
      };
      const run = (verb: TaskVerb) =>
        verb.id === "setPriority"
          ? () => {
              setPriority([task], verb.priority);
            }
          : runs[verb.id];
      return taskVerbs(task, place).map((verb) => ({ ...verb, run: run(verb) }));
    },
    [update, setStatus, setPriority, remove, duplicate, toggleComplete, taskLink, setOpenTask],
  );
}

/** The verbs as shortcut handlers; a key the shortcut shares, such as Priority's, runs its own. */
export function verbShortcuts(verbs: RunnableTaskVerb[]): ShortcutHandlers {
  const handlers: ShortcutHandlers = {};
  for (const { shortcut } of verbs) {
    if (!shortcut) continue;
    handlers[shortcut] = (event) => {
      const pressed = matchingBinding(event, shortcut);
      verbs
        .find((verb) => verb.shortcut === shortcut && (verb.binding ?? pressed) === pressed)
        ?.run();
    };
  }
  return handlers;
}
