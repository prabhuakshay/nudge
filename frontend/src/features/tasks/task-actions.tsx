import { Ellipsis } from "lucide-react";
import { Fragment, type ReactNode } from "react";

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
import { MoveToSectionSub } from "@/features/sections/move-to-section";
import { ariaKeyShortcuts, shortcutText } from "@/features/shortcuts/registry";
import { cn } from "@/lib/utils";

import type { Task } from "./tasks";
import { useTaskVerbs, type RunnableTaskVerb } from "./use-task-verbs";

/** The parts each kind of menu builds its items from. */
const MENU_PARTS = {
  dropdown: {
    Item: DropdownMenuItem,
    Separator: DropdownMenuSeparator,
    Shortcut: DropdownMenuShortcut,
  },
  context: {
    Item: ContextMenuItem,
    Separator: ContextMenuSeparator,
    Shortcut: ContextMenuShortcut,
  },
};

/**
 * A Task menu's items: on right-click the verbs only it lists, such as Open, then Move to section
 * and the verbs both menus list, the destructive ones last. A read-only Task can't change Section.
 */
function TaskMenuItems({
  task,
  verbs,
  menu,
  readOnly,
}: {
  task: Task;
  verbs: RunnableTaskVerb[];
  menu: keyof typeof MENU_PARTS;
  readOnly: boolean;
}) {
  const { Item, Separator, Shortcut } = MENU_PARTS[menu];
  const contextOnly = menu === "context" ? verbs.filter((verb) => verb.menu === "context") : [];
  const item = ({ id, label, icon: Icon, shortcut, danger, run }: RunnableTaskVerb) => (
    <Fragment key={id}>
      {danger && <Separator />}
      <Item
        onSelect={run}
        variant={danger ? "danger" : "default"}
        aria-keyshortcuts={shortcut && ariaKeyShortcuts(shortcut)}
      >
        {Icon && <Icon aria-hidden />}
        {label}
        {shortcut && <Shortcut aria-hidden>{shortcutText(shortcut)}</Shortcut>}
      </Item>
    </Fragment>
  );
  return (
    <>
      {contextOnly.length > 0 && (
        <>
          {contextOnly.map(item)}
          <Separator />
        </>
      )}
      {!readOnly && <MoveToSectionSub task={task} menu={menu} />}
      {verbs.filter((verb) => verb.menu === "all").map(item)}
    </>
  );
}

/** The ⋯ menu of a Task, in the drawer's header and at the end of its row. */
export function TaskActionsMenu({
  task,
  readOnly = false,
  onDeleted,
  className,
}: {
  task: Task;
  readOnly?: boolean;
  /** Runs after Delete, so the drawer can close. */
  onDeleted?: () => void;
  className?: string;
}) {
  const verbs = useTaskVerbs()(task, { readOnly, inDrawer: false }, { onDeleted });
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
        <TaskMenuItems task={task} verbs={verbs} menu="dropdown" readOnly={readOnly} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * A row's right-click menu: open and complete the Task, then the verbs of its ⋯ menu. Off on
 * touch screens, where a long press starts a drag instead, and in archived Projects.
 */
export function TaskContextMenu({
  task,
  disabled,
  onOpen,
  children,
}: {
  task: Task;
  disabled: boolean;
  onOpen: (taskId: number) => void;
  children: ReactNode;
}) {
  const verbs = useTaskVerbs()(task, { readOnly: false, inDrawer: false }, { onOpen });
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild disabled={disabled}>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <TaskMenuItems task={task} verbs={verbs} menu="context" readOnly={false} />
      </ContextMenuContent>
    </ContextMenu>
  );
}
