import type { UniqueIdentifier } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";

import type { Section } from "@/features/sections/sections";

import type { BoardColumnCards } from "./board-column";

/* Where a dragged Board card goes, worked out from the columns as they stand. */

/** The id a column drops by, so a card can land in it even when it has no cards. */
export function columnId(section: Section | null) {
  return `column-${String(section?.id ?? "none")}`;
}

/** The index of the column `id` names, or of the column holding the card `id` names. */
function columnOf(columns: BoardColumnCards[], id: UniqueIdentifier) {
  return columns.findIndex(
    ({ section, cards }) => columnId(section) === id || cards.some(({ task }) => task.id === id),
  );
}

function indexIn(column: BoardColumnCards | undefined, taskId: UniqueIdentifier) {
  return column?.cards.findIndex(({ task }) => task.id === taskId) ?? -1;
}

/** The card `taskId` names, wherever it is. */
export function cardOf(columns: BoardColumnCards[], taskId: UniqueIdentifier) {
  const column = columns[columnOf(columns, taskId)];
  return column?.cards[indexIn(column, taskId)];
}

/**
 * The columns with the dragged card over `overId`, a card or a column: in another column it
 * takes that card's place, or the next one when `below` it, or the last when over the column
 * itself. Within its own column it stays put until it is dropped.
 */
export function draggedOver(
  columns: BoardColumnCards[],
  activeId: UniqueIdentifier,
  overId: UniqueIdentifier,
  below: boolean,
) {
  const from = columnOf(columns, activeId);
  const to = columnOf(columns, overId);
  const card = cardOf(columns, activeId);
  const target = columns[to];
  if (from === to || !card || !target) return columns;
  const over = indexIn(target, overId);
  const at = over === -1 ? target.cards.length : over + (below ? 1 : 0);
  return columns.map((column, index) => {
    if (index === from) return { ...column, cards: column.cards.filter((row) => row !== card) };
    if (index !== to) return column;
    return { ...column, cards: [...column.cards.slice(0, at), card, ...column.cards.slice(at)] };
  });
}

/** The columns with the dragged card dropped on `overId`, reordered within its column. */
export function droppedOn(
  columns: BoardColumnCards[],
  activeId: UniqueIdentifier,
  overId: UniqueIdentifier,
) {
  const at = columnOf(columns, activeId);
  const column = columns[at];
  const from = indexIn(column, activeId);
  const to = indexIn(column, overId);
  if (!column || to === -1 || from === to) return columns;
  return columns.with(at, { ...column, cards: arrayMove(column.cards, from, to) });
}

/** Where a card sits, as the move endpoint takes it: its Section and the card it follows. */
export function placeOf(columns: BoardColumnCards[], taskId: number) {
  const column = columns[columnOf(columns, taskId)];
  const index = indexIn(column, taskId);
  return {
    sectionId: column?.section?.id ?? null,
    afterId: column?.cards[index - 1]?.task.id ?? null,
  };
}
