/**
 * Which rows of a Task list are selected for the "N selected" bar, as Shift/Mod-click and
 * Shift+↑/↓ change it. Kept as plain values so each step is easy to follow and test.
 */
export type Selection = {
  ids: ReadonlySet<number>;
  /** The row a Shift range counts from: the last row Mod-clicked, or where the range began. */
  anchor: number | null;
  /** The rows picked before the current range, which a Shift range keeps. */
  base: ReadonlySet<number>;
};

export const NO_SELECTION: Selection = { ids: new Set(), anchor: null, base: new Set() };

/** Add a row to the selection, or take it off, as Mod-click does; it anchors the next range. */
export function toggleSelected(selection: Selection, taskId: number): Selection {
  const ids = new Set(selection.ids);
  if (!ids.delete(taskId)) ids.add(taskId);
  return { ids, anchor: taskId, base: ids };
}

/**
 * Select every row from the anchor to `to` in the list's `order`, on top of the rows picked
 * before, as Shift-click and Shift+↑/↓ do. With no anchor yet, the range starts at `from`.
 */
export function selectRange(
  selection: Selection,
  from: number,
  to: number,
  order: readonly number[],
): Selection {
  const anchor = selection.anchor ?? from;
  const start = order.indexOf(anchor);
  const end = order.indexOf(to);
  if (start === -1 || end === -1) return selection;
  const range = order.slice(Math.min(start, end), Math.max(start, end) + 1);
  return { ids: new Set([...selection.base, ...range]), anchor, base: selection.base };
}
