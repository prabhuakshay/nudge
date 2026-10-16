import { Ban, Copy, Ellipsis, Link2, Pin, PinOff, Trash2, type LucideIcon } from "lucide-react";
import { Fragment, type ReactNode } from "react";
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
  DropdownMenuShortcut,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MoveToSectionContextSub,
  MoveToSectionDropdownSub,
} from "@/features/sections/move-to-section";
import { ariaKeyShortcuts, shortcutText, type ShortcutId } from "@/features/shortcuts/registry";
import { useDeleteTask } from "@/features/trash/trash";
import { cn } from "@/lib/utils";

import { useTaskLink } from "./open-task";
import { isClosed } from "./task-properties";
import { useDuplicateTask } from "./task-placement";
import { useSetTaskStatus } from "./set-status";
import { useUpdateTask, type Task } from "./tasks";

type TaskAction = {
  label: string;
  icon: LucideIcon;
  run: () => void;
  /** Destructive actions come last and show in the danger colour. */
  danger?: boolean;
  /** The shortcut that does the same on a focused row or in the drawer, shown in the menus. */
  shortcut?: ShortcutId;
};

async function copyLink(link: string) {
  try {
    await navigator.clipboard.writeText(link);
    toast("Link copied");
  } catch {
    toast.error("Could not copy the link.");
  }
}

/**
 * The less common actions on a Task, in the order its menus list them. A read-only Task, in an
 * archived Project, only offers its link. `onDeleted` runs once the Task is on its way to Trash.
 */
function useTaskActions(task: Task, readOnly = false, onDeleted?: () => void): TaskAction[] {
  const { mutate: update } = useUpdateTask();
  const { mutate: deleteTask } = useDeleteTask();
  const { mutate: setStatus } = useSetTaskStatus();
  const { mutate: duplicate } = useDuplicateTask();
  const taskLink = useTaskLink();
  const pinned = task.pinned_at !== null;
  const wontDo = task.status === "wont_do";
  const pin: TaskAction = {
    label: pinned ? "Unpin" : "Pin to top",
    icon: pinned ? PinOff : Pin,
    shortcut: "togglePin",
    run: () => {
      update({ id: task.id, pinned: !pinned });
    },
  };
  const copy: TaskAction = {
    label: "Copy link",
    icon: Link2,
    run: () => void copyLink(taskLink(task.id)),
  };
  if (readOnly) return [copy];
  return [
    // Only a root can be pinned: a Subtask shows under its parent.
    ...(task.parent_id === null ? [pin] : []),
    {
      label: wontDo ? "Reopen" : "Won't do",
      shortcut: "markWontDo",
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
    copy,
    {
      label: "Delete",
      icon: Trash2,
      danger: true,
      shortcut: "deleteTask",
      run: () => {
        deleteTask(task);
        onDeleted?.();
      },
    },
  ];
}

/** The ⋯ menu of a Task, in the drawer's header and at the end of its row. */
export function TaskActionsMenu({
  task,
  readOnly,
  onDeleted,
  className,
}: {
  task: Task;
  readOnly?: boolean;
  /** Runs after Delete, so the drawer can close. */
  onDeleted?: () => void;
  className?: string;
}) {
  const actions = useTaskActions(task, readOnly, onDeleted);
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
        {!readOnly && <MoveToSectionDropdownSub task={task} />}
        {actions.map(({ label, icon: Icon, run, danger, shortcut }) => (
          <Fragment key={label}>
            {danger && <DropdownMenuSeparator />}
            <DropdownMenuItem
              onSelect={run}
              variant={danger ? "danger" : "default"}
              aria-keyshortcuts={shortcut && ariaKeyShortcuts(shortcut)}
            >
              <Icon aria-hidden />
              {label}
              {shortcut && (
                <DropdownMenuShortcut aria-hidden>{shortcutText(shortcut)}</DropdownMenuShortcut>
              )}
            </DropdownMenuItem>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * A row's right-click menu: open and complete the Task, then the actions of its ⋯ menu. Off on
 * touch screens, where a long press starts a drag instead, and in archived Projects.
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
        <ContextMenuItem onSelect={onOpen} aria-keyshortcuts={ariaKeyShortcuts("openTask")}>
          Open
          <ContextMenuShortcut aria-hidden>{shortcutText("openTask")}</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onSelect={onToggle} aria-keyshortcuts={ariaKeyShortcuts("completeTask")}>
          {isClosed(task.status) ? "Reopen" : "Complete"}
          <ContextMenuShortcut aria-hidden>{shortcutText("completeTask")}</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <MoveToSectionContextSub task={task} />
        {actions.map(({ label, icon: Icon, run, danger, shortcut }) => (
          <Fragment key={label}>
            {danger && <ContextMenuSeparator />}
            <ContextMenuItem
              onSelect={run}
              variant={danger ? "danger" : "default"}
              aria-keyshortcuts={shortcut && ariaKeyShortcuts(shortcut)}
            >
              <Icon aria-hidden />
              {label}
              {shortcut && (
                <ContextMenuShortcut aria-hidden>{shortcutText(shortcut)}</ContextMenuShortcut>
              )}
            </ContextMenuItem>
          </Fragment>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  );
}
