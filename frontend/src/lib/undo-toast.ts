import { toast } from "sonner";

type Undo = { toastId: string | number; undo: () => void };

/** The newest change still offering Undo in a toast, which Mod+Z undoes. */
let latest: Undo | null = null;

function forget(toastId: string | number) {
  if (latest?.toastId === toastId) latest = null;
}

/**
 * Report a change in a toast with an Undo button. Until the toast goes away, Mod+Z
 * (`undoLatestChange`) undoes it too.
 */
export function toastWithUndo(message: string, undo: () => void) {
  const toastId = toast(message, {
    action: {
      label: "Undo",
      onClick: () => {
        forget(toastId);
        undo();
      },
    },
    onDismiss: (dismissed) => {
      forget(dismissed.id);
    },
    onAutoClose: (closed) => {
      forget(closed.id);
    },
  });
  latest = { toastId, undo };
}

/** Undo the newest change whose toast still offers Undo, and close that toast. */
export function undoLatestChange() {
  if (!latest) return;
  const { toastId, undo } = latest;
  latest = null;
  toast.dismiss(toastId);
  undo();
}
