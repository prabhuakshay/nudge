import { inTextField, useShortcuts } from "@/features/shortcuts/use-shortcuts";

import type { TaskDetail } from "./tasks";
import { useTaskVerbs, verbShortcuts } from "./use-task-verbs";

/**
 * The open drawer's keys: J/K or ↑/↓ step to the previous or next Task, and the keys of the
 * Task's verbs change this one.
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
  const taskVerbs = useTaskVerbs();
  const verbs = taskVerbs(task, { readOnly, inDrawer: true }, { onOpen, onDeleted: onClose })
    // Space in the drawer is for its buttons and checkboxes.
    .filter((verb) => verb.id !== "completeTask");

  useShortcuts({
    previousTask: () => {
      if (previous !== undefined) onOpen(previous);
    },
    nextTask: () => {
      if (next !== undefined) onOpen(next);
    },
    ...verbShortcuts(verbs),
  });
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
