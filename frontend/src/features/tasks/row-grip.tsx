import { GripVertical } from "lucide-react";

import type { DragHandle } from "./sortable-tree";

/**
 * The drag handle at a row's left edge, shown on hover or focus from `lg`, for rows that drag.
 * Touch screens have none: a press and hold drags the whole row. Space or Enter on it starts a
 * keyboard drag.
 */
export function Grip({
  title,
  handle,
  touch,
  left,
}: {
  title: string;
  handle: DragHandle | undefined;
  touch: boolean | undefined;
  left: number;
}) {
  if (!handle || touch) return null;
  const { setNode, attributes, listeners } = handle;
  return (
    <button
      type="button"
      ref={setNode}
      {...attributes}
      {...listeners}
      aria-label={`Drag “${title}”`}
      onClick={(event) => {
        // The row behind it opens the Task; the grip only drags.
        event.stopPropagation();
      }}
      style={{ left }}
      className="absolute top-1/2 hidden h-6 w-3.5 -translate-y-1/2 cursor-grab touch-none items-center justify-center rounded text-muted-foreground/60 opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100 hover:text-foreground focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-ring active:cursor-grabbing lg:flex"
    >
      <GripVertical className="size-3.5 shrink-0" aria-hidden />
    </button>
  );
}
