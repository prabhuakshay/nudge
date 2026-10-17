import { api } from "@/api/client";
import { failureReason } from "@/api/errors";
import type { components } from "@/api/schema";
import { toastWithUndo } from "@/lib/undo-toast";

import { advances, statusToast } from "./repeat";
import { useTaskMutation, type TaskChange } from "./task-cache";
import { patchTask, type Task, type TaskStatus } from "./tasks";

/** A Task a Status change touched, with the Status and Blocked reason it had before. */
export type AffectedTask = components["schemas"]["AffectedTaskOut"];

/** The change that gives a Task back the Status and Blocked reason it had. */
function priorStatus(prior: AffectedTask): TaskChange {
  const patch = {
    id: prior.id,
    status: prior.prior_status,
    ...(prior.prior_status === "blocked" && { blocked_reason: prior.prior_blocked_reason }),
  };
  return { kind: "patch", patch };
}

/**
 * Give every Task a change touched back the Status and Blocked reason it had, in one request
 * and in the order given, for Undo. The lists show it before the server answers.
 */
export function useRestoreStatuses() {
  return useTaskMutation({
    mutationFn: async (affected: AffectedTask[]) => {
      const statuses = affected.map((prior) => ({
        id: prior.id,
        status: prior.prior_status,
        blocked_reason: prior.prior_blocked_reason,
      }));
      const { error } = await api.POST("/api/v1/tasks/bulk", {
        body: { ids: statuses.map((each) => each.id), action: { kind: "statuses", statuses } },
      });
      if (error) {
        throw new Error(failureReason(error, "Could not undo the change."));
      }
    },
    changes: (affected) => affected.map(priorStatus),
  });
}

/**
 * Report a Status change to `task`, as the server returned it, in a toast with Undo. Undo hands
 * every Task the change touched, with the Status and Blocked reason it had, to `restore`; for a
 * repeating Task that moved on, that takes it back.
 */
export function offerStatusUndo(
  restore: (affected: AffectedTask[]) => void,
  task: Task,
  status: TaskStatus,
  affected: AffectedTask[],
) {
  toastWithUndo(statusToast(task, status, affected.length - 1), () => {
    restore(affected);
  });
}

/** Set a Task's Status, then offer Undo in a toast. */
export function useSetTaskStatus() {
  const { mutate: restore } = useRestoreStatuses();
  return useTaskMutation({
    mutationFn: ({ task, status }: { task: Task; status: TaskStatus }) =>
      patchTask({ id: task.id, status }),
    // A repeating Task moves on rather than closing, so it stays where it is until the server says.
    changes: ({ task, status }) =>
      advances(task, status) ? [] : [{ kind: "patch", patch: { id: task.id, status } }],
    onSuccess: ({ task, affected }, { status }) => {
      offerStatusUndo(restore, task, status, affected);
    },
  });
}
