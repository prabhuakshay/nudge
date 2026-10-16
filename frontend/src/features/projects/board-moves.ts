import type { UniqueIdentifier } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";

import type { Section } from "@/features/sections/sections";
import type { TreeRow } from "@/features/tasks/task-tree";

import type { BoardColumnCards } from "./board-column";

/* Where a dragged Board card or column goes, worked out from the columns as they stand. */

const NO_SECTION_COLUMN = "column-none";

/**
 * The id a column drags and drops by, so a card can land in it even when it has no cards. A
 * Section's column drags by it too. Column ids are strings and card ids are their Tasks' numeric
 * ids, so the two never clash.
 */
export function columnId(section: Section | null) {
  return section ? `column-${String(section.id)}` : NO_SECTION_COLUMN;
}

/** Whether `id` names a Section's column, rather than a card or No section's column. */
export function isSectionColumn(id: UniqueIdentifier) {
  return typeof id === "string" && id !== NO_SECTION_COLUMN;
}

/**
 * The Section move a column dropped on another Section's column makes, as the move endpoint
 * takes it: the dragged Section and the one it now follows. Null when it lands where it was.
 */
export function sectionMoveOf(
  sections: Section[],
  activeId: UniqueIdentifier,
  overId: UniqueIdentifier,
) {
  const ids = sections.map(columnId);
  const from = ids.indexOf(String(activeId));
  const to = ids.indexOf(String(overId));
  if (from === -1 || to === -1 || from === to) return null;
  const order = arrayMove(sections, from, to);
  const moved = order[to];
  return moved && { id: moved.id, after_id: order[to - 1]?.id ?? null };
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

function isPinned({ task }: TreeRow) {
  return task.pinned_at !== null;
}

/**
 * The cards with `card` put among them as near `at` as the column's order allows: Pinned cards
 * stay at the top in the order they were pinned, as the server lists them, and the rest below.
 */
function insertCard(cards: TreeRow[], card: TreeRow, at: number) {
  const pinned = cards.filter(isPinned);
  const pinnedAt = card.task.pinned_at;
  const index =
    pinnedAt === null
      ? Math.max(at, pinned.length)
      : pinned.filter(({ task }) => (task.pinned_at ?? "") <= pinnedAt).length;
  return [...cards.slice(0, index), card, ...cards.slice(index)];
}

/**
 * The cards with the Pinned ones first, in the order they were pinned, as the server lists them,
 * so a card moved before the server answers already shows where it will stay.
 */
export function pinnedFirst(cards: TreeRow[]) {
  const byPinning = (a: TreeRow, b: TreeRow) =>
    (a.task.pinned_at ?? "").localeCompare(b.task.pinned_at ?? "");
  return [
    ...cards.filter(isPinned).toSorted(byPinning),
    ...cards.filter((card) => !isPinned(card)),
  ];
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
    return { ...column, cards: insertCard(column.cards, card, at) };
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
  const card = column?.cards[indexIn(column, activeId)];
  const to = indexIn(column, overId);
  if (!column || !card || to === -1) return columns;
  const rest = column.cards.filter((row) => row !== card);
  return columns.with(at, { ...column, cards: insertCard(rest, card, to) });
}

/**
 * Where a card sits, as the move endpoint takes it: its Section and the card it follows. The
 * first card below the Pinned ones follows none, so it goes first among the unpinned: Pinned
 * cards sit first whatever their place in the Project's order.
 */
export function placeOf(columns: BoardColumnCards[], taskId: number) {
  const column = columns[columnOf(columns, taskId)];
  const index = indexIn(column, taskId);
  const card = column?.cards[index];
  const above = column?.cards[index - 1];
  return {
    sectionId: column?.section?.id ?? null,
    afterId: card && above && isPinned(above) === isPinned(card) ? above.task.id : null,
  };
}
