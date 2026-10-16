import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";

import type { Section } from "@/features/sections/sections";
import type { TreeRow } from "@/features/tasks/task-tree";
import type { Task } from "@/features/tasks/tasks";
import { cn } from "@/lib/utils";

import { BoardAddTask } from "./board-add-task";
import { BoardClosedFold } from "./board-closed";
import { BoardColumnHeader } from "./board-column-header";
import { SortableBoardCard } from "./board-drag";
import { columnId } from "./board-moves";

/** One Board column: a Section, or No section for null, and its root Tasks as cards in order. */
export type BoardColumnCards = { section: Section | null; cards: TreeRow[] };

const COLUMN =
  "flex shrink-0 snap-start flex-col rounded-xl border border-border/60 bg-surface-muted/60";

/**
 * A Board column: its header with the Section's name and how many Tasks it holds, then its cards,
 * Pinned ones first as the server lists them, then a control to add a Task at the bottom and a
 * collapsed fold of its Closed Tasks. A card dragged onto it lands in it, even when it is empty
 * or collapsed. Labelled with its place on the Board for screen readers. On phones it fills most
 * of the Board's width and snaps into place as the Board scrolls. A collapsed Section's column is
 * a narrow strip with only its header.
 */
export function BoardColumn({
  projectId,
  column: { section, cards },
  position,
  count,
  openId,
  readOnly,
  onOpen,
  onToggle,
}: {
  projectId: number;
  column: BoardColumnCards;
  /** Where the column sits on the Board, from 1, and how many columns there are. */
  position: number;
  count: number;
  /** The Task open in the drawer, whose card shows as selected. */
  openId: number | null;
  readOnly: boolean;
  onOpen: (taskId: number) => void;
  onToggle: (task: Task) => void;
}) {
  const name = section?.name ?? "No section";
  const label = `${name}, column ${String(position)} of ${String(count)}`;
  const collapsed = section?.collapsed ?? false;
  const { setNodeRef } = useDroppable({ id: columnId(section), disabled: readOnly });
  if (collapsed) {
    return (
      <section ref={setNodeRef} aria-label={label} className={cn(COLUMN, "w-11")}>
        <BoardColumnHeader section={section} count={cards.length} readOnly={readOnly} />
      </section>
    );
  }
  return (
    <section ref={setNodeRef} aria-label={label} className={cn(COLUMN, "w-[85%] max-w-80 sm:w-72")}>
      <BoardColumnHeader section={section} count={cards.length} readOnly={readOnly} />
      <SortableContext
        items={cards.map(({ task }) => task.id)}
        strategy={verticalListSortingStrategy}
      >
        {cards.length === 0 ? (
          <p className="px-3 pt-2 pb-4 text-center text-xs text-muted-foreground">No tasks</p>
        ) : (
          <ul aria-label={`${name} tasks`} className="flex flex-col gap-2 px-2 pb-2">
            {cards.map((card, index) => (
              <SortableBoardCard
                key={card.task.id}
                card={card}
                label={`${String(index + 1)} of ${String(cards.length)} in ${name}`}
                selected={card.task.id === openId}
                readOnly={readOnly}
                onOpen={onOpen}
                onToggle={onToggle}
              />
            ))}
          </ul>
        )}
      </SortableContext>
      {!readOnly && <BoardAddTask projectId={projectId} section={section} />}
      <BoardClosedFold
        projectId={projectId}
        section={section}
        openId={openId}
        readOnly={readOnly}
        onOpen={onOpen}
        onToggle={onToggle}
      />
    </section>
  );
}
