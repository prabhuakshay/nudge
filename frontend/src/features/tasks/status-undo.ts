import type { components } from "@/api/schema";
import { toastWithUndo } from "@/lib/undo-toast";

import { statusToast } from "./repeat";
import type { Task, TaskChange, TaskStatus } from "./tasks";

type AffectedTask = components["schemas"]["AffectedTaskOut"];

/**
 * Report a Status change to `task`, as the server returned it, in a toast with Undo. Undo gives
 * every Task the change touched back the Status and Blocked reason it had, as the server reported
 * them, through `update`; for a repeating Task that moved on, that takes it back.
 */
export function offerStatusUndo(
  update: (change: TaskChange) => void,
  task: Task,
  status: TaskStatus,
  affected: AffectedTask[],
) {
  toastWithUndo(statusToast(task, status, affected.length - 1), () => {
    for (const prior of affected) {
      update({
        id: prior.id,
        status: prior.prior_status,
        ...(prior.prior_status === "blocked" && {
          blocked_reason: prior.prior_blocked_reason,
        }),
      });
    }
  });
}
