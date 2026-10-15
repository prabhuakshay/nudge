import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { api } from "@/api/client";
import type { components } from "@/api/schema";
import { toastWithUndo } from "@/lib/undo-toast";

import { advances, statusToast } from "./repeat";
import {
  patchTask,
  refreshTasks,
  showChange,
  type Task,
  type TaskChange,
  type TaskStatus,
} from "./tasks";

/** A Task a Status change touched, with the Status and Blocked reason it had before. */
export type AffectedTask = components["schemas"]["AffectedTaskOut"];

/** The change that gives a Task back the Status and Blocked reason it had. */
function priorStatus(prior: AffectedTask): TaskChange {
  return {
    id: prior.id,
    status: prior.prior_status,
    ...(prior.prior_status === "blocked" && { blocked_reason: prior.prior_blocked_reason }),
  };
}

/**
 * Give every Task a change touched back the Status and Blocked reason it had, in one request
 * and in the order given, for Undo. The lists show it before the server answers.
 */
export function useRestoreStatuses() {
  const queryClient = useQueryClient();
  return useMutation({
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
        throw new Error("detail" in error ? error.detail : "Could not undo the change.");
      }
    },
    onMutate: (affected) =>
      Promise.all(affected.map((prior) => showChange(queryClient, priorStatus(prior)))),
    onError: (error) => toast.error(error.message),
    onSettled: () => refreshTasks(queryClient),
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
  const queryClient = useQueryClient();
  const { mutate: restore } = useRestoreStatuses();
  return useMutation({
    mutationFn: ({ task, status }: { task: Task; status: TaskStatus }) =>
      patchTask({ id: task.id, status }),
    // A repeating Task moves on rather than closing, so it stays where it is until the server says.
    onMutate: ({ task, status }) =>
      advances(task, status) ? undefined : showChange(queryClient, { id: task.id, status }),
    onSuccess: ({ task, affected }, { status }) => {
      offerStatusUndo(restore, task, status, affected);
    },
    onError: (error) => toast.error(error.message),
    onSettled: () => refreshTasks(queryClient),
  });
}
