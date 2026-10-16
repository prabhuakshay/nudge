import type { SidebarProject } from "@/features/projects/projects";
import { WORK } from "@/test/drawer";

/* Shared setup for the Board's tests. */

/** The Work Project, shown as a Board. */
export const BOARD: SidebarProject = { ...WORK, layout: "board" };

/**
 * jsdom lays nothing out, so place each column side by side and stack its cards down it for
 * dnd-kit to measure. The drag preview floats outside the Board, so it sits where the focused
 * grip's card or column is.
 */
export function layOutBoard() {
  // Matched by label because each column's Closed fold is a labelled section too.
  const COLUMN = 'section[aria-label*=", column "]';
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const target = this.closest(COLUMN) ? this : document.activeElement;
    const column = target?.closest(COLUMN);
    if (!target || !column) return new DOMRect(0, 0, 0, 0);
    const columns = [...document.querySelectorAll(COLUMN)];
    const left = columns.indexOf(column) * 300;
    const card = target.closest("li");
    if (!card) return new DOMRect(left, 0, 280, 600);
    const top = 40 + [...column.querySelectorAll("li")].indexOf(card) * 60;
    return new DOMRect(left, top, 280, 50);
  });
}
