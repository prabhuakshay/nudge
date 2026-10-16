import { Pin } from "lucide-react";
import { memo } from "react";

import { MentionText } from "@/features/people/mention-text";
import { plainMentions } from "@/features/people/mentions";
import { TagBadge } from "@/features/tags/tag-badge";
import { DueBadge } from "@/features/tasks/due-badge";
import { SubtaskCount } from "@/features/tasks/subtask-count";
import { TaskCheckbox } from "@/features/tasks/task-checkbox";
import { PriorityFlag } from "@/features/tasks/task-priority";
import type { TreeRow } from "@/features/tasks/task-tree";
import type { Task } from "@/features/tasks/tasks";
import { cn } from "@/lib/utils";

/**
 * A root Task on the Board: its checkbox and title, then its Priority, date, Tags and Subtask
 * progress. The title's button stretches over the whole card, so a click anywhere opens the Task
 * while the checkbox above it closes it. Memoized so a change to one card leaves the others alone.
 */
export const BoardCard = memo(function BoardCard({
  card: { task, subtasks },
  label,
  selected,
  readOnly,
  onOpen,
  onToggle,
}: {
  card: TreeRow;
  /** Where the card sits, such as "2 of 5 in To do", read after its title. */
  label: string;
  selected: boolean;
  readOnly: boolean;
  onOpen: (taskId: number) => void;
  onToggle: (task: Task) => void;
}) {
  const title = plainMentions(task.title);
  return (
    <li
      data-task-id={task.id}
      className={cn(
        "relative flex flex-col gap-2 rounded-lg border bg-surface p-3 shadow-xs transition-colors",
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
          aria-label={`${title}, ${label}`}
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
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 pl-7 empty:hidden">
        <PriorityFlag priority={task.priority} />
        <DueBadge task={task} />
        {task.tags.map((tag) => (
          <TagBadge key={tag.id} tag={tag} />
        ))}
        <SubtaskCount {...subtasks} />
      </div>
    </li>
  );
});
