import { Ban, Copy, Ellipsis, Link2, Pin, PinOff, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import { useTaskLink } from "./open-task";
import { isClosed } from "./task-properties";
import { useDuplicateTask } from "./task-placement";
import { useSetTaskStatus, useUpdateTask, type Task } from "./tasks";

type TaskAction = { label: string; icon: LucideIcon; run: () => void };

async function copyLink(link: string) {
  try {
    await navigator.clipboard.writeText(link);
    toast("Link copied");
  } catch {
    toast.error("Could not copy the link.");
  }
}

/** The less common actions on a Task, in the order its menus list them. */
function useTaskActions(task: Task): TaskAction[] {
  const { mutate: update } = useUpdateTask();
  const { mutate: setStatus } = useSetTaskStatus();
  const { mutate: duplicate } = useDuplicateTask();
  const taskLink = useTaskLink();
  const pinned = task.pinned_at !== null;
  const wontDo = task.status === "wont_do";
  const pin: TaskAction = {
    label: pinned ? "Unpin" : "Pin to top",
    icon: pinned ? PinOff : Pin,
    run: () => {
      update({ id: task.id, pinned: !pinned });
    },
  };
  return [
    // Only a root can be pinned: a Subtask shows under its parent.
    ...(task.parent_id === null ? [pin] : []),
    {
      label: wontDo ? "Reopen" : "Won't do",
      icon: Ban,
      run: () => {
        setStatus({ task, status: wontDo ? "open" : "wont_do" });
      },
    },
    {
      label: "Duplicate",
      icon: Copy,
      run: () => {
        duplicate(task.id);
      },
    },
    {
      label: "Copy link",
      icon: Link2,
      run: () => void copyLink(taskLink(task.id)),
    },
  ];
}

/** The ⋯ menu of a Task, in the drawer's header and at the end of its row. */
export function TaskActionsMenu({ task, className }: { task: Task; className?: string }) {
  const actions = useTaskActions(task);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="More actions"
          // In a row, the click is the menu's, not the row's.
          onClick={(event) => {
            event.stopPropagation();
          }}
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring data-[state=open]:bg-surface-muted sm:size-8",
            className,
          )}
        >
          <Ellipsis className="size-4" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {actions.map(({ label, icon: Icon, run }) => (
          <DropdownMenuItem key={label} onSelect={run}>
            <Icon aria-hidden />
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * A row's right-click menu: open and complete the Task, then the actions of its ⋯ menu. Off on
 * touch screens, where a long press starts a drag instead.
 */
export function TaskContextMenu({
  task,
  disabled,
  onOpen,
  onToggle,
  children,
}: {
  task: Task;
  disabled: boolean;
  onOpen: () => void;
  /** Complete the Task, or reopen it when it is Closed. */
  onToggle: () => void;
  children: ReactNode;
}) {
  const actions = useTaskActions(task);
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild disabled={disabled}>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuItem onSelect={onOpen}>
          Open
          <ContextMenuShortcut>Enter</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onSelect={onToggle}>
          {isClosed(task.status) ? "Reopen" : "Complete"}
        </ContextMenuItem>
        <ContextMenuSeparator />
        {actions.map(({ label, icon: Icon, run }) => (
          <ContextMenuItem key={label} onSelect={run}>
            <Icon aria-hidden />
            {label}
          </ContextMenuItem>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  );
}
