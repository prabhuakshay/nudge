import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

import type { Task } from "./tasks";

/** The round-cornered box that completes a Task, or reopens it once Completed. */
export function TaskCheckbox({
  task,
  onToggle,
  className,
}: {
  task: Task;
  onToggle: () => void;
  className?: string;
}) {
  const completed = task.status === "completed";
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={completed}
      aria-label={completed ? `Reopen “${task.title}”` : `Complete “${task.title}”`}
      onClick={(event) => {
        // The row behind it opens the Task; the checkbox only toggles it.
        event.stopPropagation();
        onToggle();
      }}
      className={cn(
        "group/check relative flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border-2 transition-all duration-150 active:scale-90",
        completed
          ? "border-muted-foreground/40 bg-muted-foreground/40 text-surface"
          : "border-muted-foreground/45 bg-surface text-muted-foreground",
        // A bigger hit area than the box itself, for fingers.
        "after:absolute after:-inset-2.5 after:content-['']",
        className,
      )}
    >
      <Check
        className={cn(
          "size-3/4",
          !completed && "opacity-0 transition-opacity group-hover/check:opacity-60",
        )}
        strokeWidth={3.5}
        aria-hidden
      />
    </button>
  );
}
