import { useEffect, useRef, useState } from "react";

import { inTextField, useShortcuts } from "@/features/shortcuts/use-shortcuts";

import { forgetDetailAction, requestedDetailAction, useTaskKeys } from "./task-keys";
import type { TaskDetail } from "./tasks";

/**
 * The open drawer's keys: J/K or ↑/↓ step to the previous or next Task, and the Task keys change
 * this one. Returns the ref for the drawer's body, where the keys find the chips and fields they
 * open. A Task key pressed on a row before the drawer opened, such as D, is done here once the
 * Task shows.
 */
export function useDetailKeys({
  task,
  readOnly,
  previous,
  next,
  onOpen,
  onClose,
}: {
  task: TaskDetail;
  readOnly: boolean;
  previous: number | undefined;
  next: number | undefined;
  onOpen: (taskId: number) => void;
  onClose: () => void;
}) {
  const body = useRef<HTMLDivElement>(null);
  const taskKeys = useTaskKeys();
  // A new object for every request, so pressing the same key twice runs it twice.
  const [request, setRequest] = useState(() => {
    const action = requestedDetailAction(task.id);
    return action && { action };
  });
  const done = useRef<typeof request>(null);

  useEffect(forgetDetailAction, []);

  // The chip or field may only show once the Task changes, as the Blocked reason does after B.
  useEffect(() => {
    if (!request || done.current === request) return;
    const target = body.current?.querySelector<HTMLElement>(`[data-shortcut="${request.action}"]`);
    if (!target) return;
    done.current = request;
    if (inTextField(target)) target.focus();
    else target.click();
  }, [request, task]);

  useShortcuts({
    previousTask: () => {
      if (previous !== undefined) onOpen(previous);
    },
    nextTask: () => {
      if (next !== undefined) onOpen(next);
    },
    ...(!readOnly &&
      taskKeys(task, {
        inDetail: (action) => {
          setRequest({ action });
        },
        onDeleted: onClose,
      })),
  });

  return body;
}

/**
 * Esc in one of the drawer's fields leaves the field instead of closing the drawer: the field
 * cancels its edit, if it can, and focus goes back to the drawer for its keys. For the drawer's
 * `onEscapeKeyDown`.
 */
export function backOutOfField(event: KeyboardEvent) {
  const field = event.target;
  if (!(field instanceof HTMLElement) || !inTextField(field)) return;
  event.preventDefault();
  // A filled Quick add field, such as Add subtask, first closes its picker or clears itself.
  if (field instanceof HTMLInputElement && field.role === "combobox" && field.value) return;
  // After the field's own Esc handler, which runs next and may put its saved value back.
  queueMicrotask(() => {
    field.closest<HTMLElement>("[role=dialog]")?.focus();
  });
}
