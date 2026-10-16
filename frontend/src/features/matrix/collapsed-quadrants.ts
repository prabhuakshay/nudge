/**
 * Which Quadrants the user folded away on a phone. Kept in localStorage: it's a convenience for
 * one screen, so a browser that can't store it opens every Quadrant.
 */
import { useState } from "react";

import { QUADRANTS, type Quadrant } from "./quadrants";

const KEY = "nudge.matrix.collapsed";

function load(): Quadrant[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(stored) ? QUADRANTS.filter((id) => stored.includes(id)) : [];
  } catch {
    return [];
  }
}

function save(collapsed: readonly Quadrant[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(collapsed));
  } catch {
    // Storage is full or blocked; the Quadrants just open again next time.
  }
}

/** The folded Quadrants, and a toggle that folds or opens one and remembers it. */
export function useCollapsedQuadrants() {
  const [collapsed, setCollapsed] = useState<readonly Quadrant[]>(load);
  return {
    collapsed,
    toggle: (quadrant: Quadrant) => {
      const next = collapsed.includes(quadrant)
        ? collapsed.filter((id) => id !== quadrant)
        : [...collapsed, quadrant];
      save(next);
      setCollapsed(next);
    },
  };
}
