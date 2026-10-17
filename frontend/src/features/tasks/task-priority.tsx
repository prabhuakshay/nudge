import { Flag } from "lucide-react";
import type { ReactNode } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import { PRIORITIES, PRIORITY } from "./task-properties";
import type { Task, TaskPriority } from "./tasks";
import { useUndoableTaskChanges } from "./task-undo";

/** A filled flag in the Priority's colour; nothing for no Priority. */
export function PriorityFlag({ priority }: { priority: TaskPriority }) {
  if (priority === 0) return null;
  return (
    <Flag
      role="img"
      aria-label={PRIORITY[priority].long}
      className={cn("size-3.5 shrink-0 fill-current", PRIORITY[priority].text)}
    />
  );
}

/** A Priority as a small coloured label, such as "P1". */
export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded-md px-1.5 text-[11px] font-bold",
        PRIORITY[priority].soft,
        PRIORITY[priority].text,
      )}
    >
      <Flag className="size-3 fill-current" aria-hidden />
      {PRIORITY[priority].short}
    </span>
  );
}

/** The Priority picker. Its trigger is `children`, so the list cell and the drawer chip share it. */
export function PriorityMenu({ task, children }: { task: Task; children: ReactNode }) {
  const { setPriority } = useUndoableTaskChanges();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        <DropdownMenuLabel>Priority</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={String(task.priority)}
          onValueChange={(value) => {
            const priority = PRIORITIES.find((candidate) => String(candidate) === value);
            if (priority !== undefined && priority !== task.priority) {
              setPriority([task], priority);
            }
          }}
        >
          {PRIORITIES.map((priority) => (
            <DropdownMenuRadioItem key={priority} value={String(priority)}>
              <Flag
                className={cn("size-4", priority > 0 && "fill-current", PRIORITY[priority].text)}
                aria-hidden
              />
              {PRIORITY[priority].long}
              {priority > 0 && (
                // What to type in Quick add for this Priority.
                <DropdownMenuShortcut aria-hidden>!{priority}</DropdownMenuShortcut>
              )}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
