import type { Section } from "@/features/sections/sections";
import { useSortableHandle } from "@/features/tasks/sortable-handle";
import { useMediaQuery } from "@/lib/use-media-query";

import { columnId } from "./board-moves";

/**
 * How a Board column drags: a Section's column by its header, or from its grip with the
 * keyboard. No section's always stays first, so it doesn't. Both take dropped cards; a read-only
 * column does neither. `header` is what the header drags with, undefined where it doesn't.
 */
export function useColumnDrag(section: Section | null, readOnly: boolean) {
  const touch = useMediaQuery("(pointer: coarse)");
  const fixed = readOnly || !section;
  const { handle, setNode, style, isDragging } = useSortableHandle(columnId(section), {
    draggable: fixed,
    droppable: readOnly,
  });
  return { setNode, style, isDragging, header: fixed ? undefined : { handle, touch } };
}
