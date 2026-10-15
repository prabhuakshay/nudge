import { toast } from "sonner";

import type { components } from "@/api/schema";
import { plainMentions } from "@/features/people/mentions";

import { statusMessage } from "./task-properties";
import type { TaskChange, TaskStatus } from "./tasks";

type AffectedTask = components["schemas"]["AffectedTaskOut"];

/**
 * Report a Status change in a toast with Undo. Undo gives every Task the change touched back the
 * Status and Blocked reason it had, as the server reported them, through `update`.
 */
export function offerStatusUndo(
  update: (change: TaskChange) => void,
  title: string,
  status: TaskStatus,
  affected: AffectedTask[],
) {
  toast(statusMessage(plainMentions(title), status, affected.length - 1), {
    action: {
      label: "Undo",
      onClick: () => {
        for (const prior of affected) {
          update({
            id: prior.id,
            status: prior.prior_status,
            ...(prior.prior_status === "blocked" && {
              blocked_reason: prior.prior_blocked_reason,
            }),
          });
        }
      },
    },
  });
}
