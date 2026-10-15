import { Ban } from "lucide-react";
import type { ReactNode } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MentionText } from "@/features/people/mention-text";
import { plainMentions } from "@/features/people/mentions";
import { useWithMentions } from "@/features/people/people";
import { cn } from "@/lib/utils";

import { STATUS, STATUSES } from "./task-properties";
import { useSetTaskStatus } from "./set-status";
import { useUpdateTask, type Task, type TaskStatus } from "./tasks";

/** A Task's Status as a small coloured label. */
export function StatusBadge({ status }: { status: TaskStatus }) {
  const { label, icon: Icon, text, soft } = STATUS[status];
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded-md px-1.5 text-[11px] font-semibold",
        soft,
        text,
      )}
    >
      <Icon className="size-3" aria-hidden />
      {label}
    </span>
  );
}

/** The Status picker. Its trigger is `children`, so the list cell and the drawer chip share it. */
export function StatusMenu({ task, children }: { task: Task; children: ReactNode }) {
  const { mutate: setStatus } = useSetTaskStatus();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuLabel>Status</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={task.status}
          onValueChange={(value) => {
            const status = STATUSES.find((candidate) => candidate === value);
            if (status && status !== task.status) setStatus({ task, status });
          }}
        >
          {STATUSES.map((status) => {
            const { label, icon: Icon, text } = STATUS[status];
            return (
              <DropdownMenuRadioItem key={status} value={status}>
                <Icon className={cn("size-4", text)} aria-hidden />
                {label}
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A Blocked Task's reason in one line, or just "Blocked" when it has none. */
export function BlockedNote({ task, className }: { task: Task; className?: string }) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1 text-xs text-warning", className)}>
      <Ban className="size-3 shrink-0" aria-hidden />
      <span className="truncate">
        {task.blocked_reason ? <MentionText text={task.blocked_reason} /> : "Blocked"}
      </span>
    </span>
  );
}

/** The drawer's card for a Blocked Task, where the user says what it waits on. Saves on blur. */
export function BlockedReasonField({ task, className }: { task: Task; className?: string }) {
  const { mutate: update } = useUpdateTask();
  const withMentions = useWithMentions();
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 focus-within:ring-2 focus-within:ring-ring",
        className,
      )}
    >
      <Ban className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-warning">Blocked</p>
        <input
          // A new key whenever the saved reason changes, such as on Undo, resets the field to it.
          key={`${String(task.id)}-${task.blocked_reason}`}
          aria-label="Blocked reason"
          data-shortcut="markBlocked"
          defaultValue={plainMentions(task.blocked_reason)}
          maxLength={500}
          placeholder="What is it waiting on? Type @ and a name to mention someone"
          onKeyDown={(event) => {
            if (event.key === "Escape")
              event.currentTarget.value = plainMentions(task.blocked_reason);
            if (event.key === "Enter" || event.key === "Escape") event.currentTarget.blur();
          }}
          onBlur={(event) => {
            const reason = withMentions(event.currentTarget.value.trim());
            if (reason !== task.blocked_reason) update({ id: task.id, blocked_reason: reason });
          }}
          className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
      </div>
    </div>
  );
}
