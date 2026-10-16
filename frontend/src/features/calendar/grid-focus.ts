import { useEffect, useRef } from "react";

/**
 * Keyboard focus for a Calendar grid, whose arrow keys can move to a cell that isn't drawn yet: a
 * day in another month or week needs the address to change first. `focusLater` names the cell by
 * a selector inside `grid`, and it takes focus once it is drawn.
 */
export function useFocusLater() {
  const grid = useRef<HTMLDivElement>(null);
  const pending = useRef<string | null>(null);

  useEffect(() => {
    if (pending.current === null) return;
    const cell = grid.current?.querySelector<HTMLElement>(pending.current);
    if (!cell) return;
    cell.focus();
    pending.current = null;
  });

  const focusLater = (selector: string) => {
    pending.current = selector;
  };
  return { grid, focusLater };
}
