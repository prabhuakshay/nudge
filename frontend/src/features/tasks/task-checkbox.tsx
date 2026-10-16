import { Check, CircleSlash } from "lucide-react";

import { plainMentions } from "@/features/people/mentions";
import { cn } from "@/lib/utils";

import { isClosed, PRIORITY } from "./task-properties";
import type { Task } from "./tasks";

/**
 * The round-cornered box that completes a Task, or reopens it once Closed. Its ring takes the
 * Priority colour, as in TickTick; Blocked dashes the ring and Won't do shows a slash.
 */
export function TaskCheckbox({
  task,
  onToggle,
  className,
  tabIndex,
}: {
  task: Task;
  onToggle: () => void;
  className?: string;
  /** -1 keeps it out of the Tab order, for a grid that moves focus with the arrow keys. */
  tabIndex?: number;
}) {
  const closed = isClosed(task.status);
  const priority = PRIORITY[task.priority];
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={closed}
      tabIndex={tabIndex}
      aria-label={`${closed ? "Reopen" : "Complete"} “${plainMentions(task.title)}”`}
      onClick={(event) => {
        // The row behind it opens the Task; the checkbox only toggles it.
        event.stopPropagation();
        onToggle();
      }}
      className={cn(
        "group/check relative flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border-2 transition-all duration-150 active:scale-90",
        task.priority > 0
          ? [priority.border, priority.soft]
          : "border-muted-foreground/45 bg-surface",
        task.status === "blocked" && "border-dashed",
        task.status === "completed" &&
          "border-muted-foreground/40 bg-muted-foreground/40 text-surface",
        task.status === "wont_do" && "border-muted-foreground/40 bg-surface text-muted-foreground",
        // A bigger hit area than the box itself, for fingers.
        "after:absolute after:-inset-2.5 after:content-['']",
        className,
      )}
    >
      {task.status === "wont_do" ? (
        <CircleSlash className="size-3/4" strokeWidth={2.5} aria-hidden />
      ) : (
        <Check
          className={cn(
            "size-3/4",
            !closed && ["opacity-0 transition-opacity group-hover/check:opacity-60", priority.text],
          )}
          strokeWidth={3.5}
          aria-hidden
        />
      )}
    </button>
  );
}
