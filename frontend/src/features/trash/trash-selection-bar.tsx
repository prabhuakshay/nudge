import { RotateCcw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useShortcuts } from "@/features/shortcuts/use-shortcuts";

/**
 * The "N selected" bar of the Trash: floats at the bottom while rows are selected, and restores
 * them or deletes them forever all at once. Esc clears the selection.
 */
export function TrashSelectionBar({
  count,
  onRestore,
  onDeleteForever,
  onClear,
}: {
  count: number;
  onRestore: () => void;
  onDeleteForever: () => void;
  onClear: () => void;
}) {
  useShortcuts({ clearSelection: onClear }, count > 0);
  if (count === 0) return null;
  return (
    <div
      role="toolbar"
      aria-label="Selected items"
      className="fixed inset-x-0 bottom-6 z-40 mx-auto flex w-fit items-center gap-1 rounded-xl border border-border bg-surface p-1.5 pl-4 shadow-lg"
    >
      <span role="status" className="mr-2 text-sm font-semibold tabular-nums">
        {count} selected
      </span>
      <Button variant="ghost" onClick={onRestore}>
        <RotateCcw aria-hidden />
        Restore
      </Button>
      <Button variant="ghost" onClick={onDeleteForever} className="text-danger hover:text-danger">
        <X aria-hidden />
        Delete forever
      </Button>
      <Button variant="ghost" size="icon" aria-label="Clear the selection" onClick={onClear}>
        <X aria-hidden />
      </Button>
    </div>
  );
}
