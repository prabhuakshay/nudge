import { Pin } from "lucide-react";
import { memo, type CSSProperties } from "react";

import { MentionText } from "@/features/people/mention-text";
import { plainMentions } from "@/features/people/mentions";
import { TagBadge } from "@/features/tags/tag-badge";
import { DueBadge } from "@/features/tasks/due-badge";
import { Grip } from "@/features/tasks/row-grip";
import { pressToDrag } from "@/features/tasks/sortable-handle";
import type { DragHandle } from "@/features/tasks/sortable-tree";
import { SubtaskCount } from "@/features/tasks/subtask-count";
import { TaskActionsMenu } from "@/features/tasks/task-actions";
import { TaskCheckbox } from "@/features/tasks/task-checkbox";
import { PriorityFlag } from "@/features/tasks/task-priority";
import type { TreeRow } from "@/features/tasks/task-tree";
import type { Task } from "@/features/tasks/tasks";
import { cn } from "@/lib/utils";

/** How a card drags, from `useSortableHandle`, and whether a press and hold starts it. */
export type CardDrag = {
  handle: DragHandle;
  setNode: (node: HTMLElement | null) => void;
  style: CSSProperties;
  isDragging: boolean;
  touch: boolean;
};

/** A card's place in its column's list: its index, how many cards it holds, and its column. */
export type CardPlace = { index: number; count: number; column: string; closed?: boolean };

/** A card's place as it is read out, such as "2 of 5 in To do" or "1 of 3 closed in Done". */
function placeLabel({ index, count, column, closed = false }: CardPlace) {
  return `${String(index + 1)} of ${String(count)} ${closed ? "closed " : ""}in ${column}`;
}

export type BoardCardProps = {
  card: TreeRow;
  /** Where the card sits, read after its title, such as "2 of 5 in To do". */
  place: CardPlace;
  selected: boolean;
  readOnly: boolean;
  onOpen: (taskId: number) => void;
  onToggle: (task: Task) => void;
  /** Left out where cards don't drag. */
  drag?: CardDrag;
};

/**
 * What makes a card drag: it moves with the drag, and a press anywhere on it starts one, as on a
 * List row. On touch screens the card is also the keyboard activator, as it has no grip there.
 */
function dragProps(drag: CardDrag | undefined) {
  if (!drag) return {};
  const { handle, touch } = drag;
  return {
    ref: (node: HTMLElement | null) => {
      drag.setNode(node);
      if (touch) handle.setNode(node);
    },
    style: drag.style,
    ...pressToDrag(handle, touch),
  };
}

/**
 * A root Task on the Board: its checkbox and title, then its Priority, date, Tags and Subtask
 * progress. The title's button stretches over the whole card, so a click anywhere opens the Task
 * while the checkbox and ⋯ menu above it close or move it. Given `drag`, the card drags between
 * and within columns, from its grip with the keyboard. Memoized so a change to one card leaves
 * the others alone.
 */
export const BoardCard = memo(function BoardCard({
  card: { task, subtasks },
  place,
  selected,
  readOnly,
  onOpen,
  onToggle,
  drag,
}: BoardCardProps) {
  const title = plainMentions(task.title);
  return (
    <li
      data-task-id={task.id}
      {...dragProps(drag)}
      className={cn(
        "group/row relative flex flex-col gap-2 rounded-lg border bg-surface p-3 shadow-xs transition-colors",
        // No text selection or iOS callout, so a long press starts a drag instead.
        drag && "select-none [-webkit-touch-callout:none]",
        drag?.isDragging && "opacity-40",
        selected ? "border-primary bg-primary-soft/40" : "border-border hover:border-ring/60",
      )}
    >
      <div className="flex items-start gap-2.5">
        <TaskCheckbox
          task={task}
          disabled={readOnly}
          onToggle={() => {
            onToggle(task);
          }}
          className="z-10 mt-px"
        />
        <button
          type="button"
          data-task-title
          aria-label={`${title}, ${placeLabel(place)}`}
          onClick={() => {
            onOpen(task.id);
          }}
          className="min-w-0 flex-1 text-left text-sm leading-5 font-semibold break-words outline-none after:absolute after:inset-0 after:rounded-lg after:content-[''] focus-visible:after:outline-2 focus-visible:after:outline-ring"
        >
          <MentionText text={task.title} />
        </button>
        {task.pinned_at !== null && (
          <Pin
            className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
            role="img"
            aria-label="Pinned"
          />
        )}
        <TaskActionsMenu task={task} readOnly={readOnly} className="z-10 -my-1.5 -mr-1.5" />
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 pl-7 empty:hidden">
        <PriorityFlag priority={task.priority} />
        <DueBadge task={task} />
        {task.tags.map((tag) => (
          <TagBadge key={tag.id} tag={tag} />
        ))}
        <SubtaskCount {...subtasks} />
      </div>
      {/* Last, so it sits above the title's stretched click area. */}
      <Grip title={title} handle={drag?.handle} touch={drag?.touch} left={-1} />
    </li>
  );
});
