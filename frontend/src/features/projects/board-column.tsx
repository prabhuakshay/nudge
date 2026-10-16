import type { Section } from "@/features/sections/sections";
import type { TreeRow } from "@/features/tasks/task-tree";
import type { Task } from "@/features/tasks/tasks";

import { BoardAddTask } from "./board-add-task";
import { BoardCard } from "./board-card";
import { BoardClosedFold } from "./board-closed";

/** One Board column: a Section, or No section for null, and its root Tasks as cards in order. */
export type BoardColumnCards = { section: Section | null; cards: TreeRow[] };

/**
 * A Board column: the Section's name and how many Tasks it holds, then its cards, Pinned ones
 * first as the server lists them, then a control to add a Task at the bottom and a collapsed
 * fold of its Closed Tasks. Labelled with its place on the Board for screen readers. On phones it
 * fills most of the Board's width and snaps into place as the Board scrolls.
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
  return (
    <section
      aria-label={`${name}, column ${String(position)} of ${String(count)}`}
      className="flex w-[85%] max-w-80 shrink-0 snap-start flex-col rounded-xl border border-border/60 bg-surface-muted/60 sm:w-72"
    >
      <header className="flex min-h-10 items-center gap-2 px-3 pt-1">
        <h2 className="min-w-0 truncate text-sm font-semibold">{name}</h2>
        <span className="text-xs text-muted-foreground tabular-nums">
          {cards.length}
          <span className="sr-only"> tasks</span>
        </span>
      </header>
      {cards.length === 0 ? (
        <p className="px-3 pt-2 pb-4 text-center text-xs text-muted-foreground">No tasks</p>
      ) : (
        <ul aria-label={`${name} tasks`} className="flex flex-col gap-2 px-2 pb-2">
          {cards.map((card, index) => (
            <BoardCard
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
