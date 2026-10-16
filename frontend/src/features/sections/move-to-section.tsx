/* "Move to section" in a Task's ⋯ and right-click menus. */

import { useQuery } from "@tanstack/react-query";
import { Rows3 } from "lucide-react";

import {
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { useMoveTask } from "@/features/tasks/task-placement";
import { sidebarQuery, type Task } from "@/features/tasks/tasks";

import { sectionsQuery } from "./sections";

type Choice = { id: number | null; name: string };

/**
 * Where a root Task can move within its Project: No section, then each Section. Empty for a
 * Subtask, which follows its root, and in the Inbox, which has no Sections. Menus mount this only
 * once they open, so a list doesn't ask for Sections it never shows.
 */
function useSectionChoices(task: Task) {
  const { data: inboxId } = useQuery({ ...sidebarQuery, select: (sidebar) => sidebar.inbox.id });
  const canMove = task.parent_id === null && inboxId !== undefined && inboxId !== task.project_id;
  const { data: sections = [] } = useQuery({
    ...sectionsQuery(task.project_id),
    enabled: canMove,
  });
  const { mutate: move } = useMoveTask();
  const choices: Choice[] =
    canMove && sections.length > 0 ? [{ id: null, name: "No section" }, ...sections] : [];
  return {
    choices,
    moveTo: (sectionId: number | null) => {
      move({ taskId: task.id, parentId: null, afterId: null, sectionId });
    },
  };
}

/** The Task's "Move to section" submenu in its ⋯ menu; nothing when it can't move. */
export function MoveToSectionDropdownSub({ task }: { task: Task }) {
  const { choices, moveTo } = useSectionChoices(task);
  if (choices.length === 0) return null;
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Rows3 aria-hidden /> Move to section
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        {choices.map(({ id, name }) => (
          <DropdownMenuItem
            key={id ?? "none"}
            disabled={task.section_id === id}
            onSelect={() => {
              moveTo(id);
            }}
          >
            {name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

/** The Task's "Move to section" submenu in its right-click menu; nothing when it can't move. */
export function MoveToSectionContextSub({ task }: { task: Task }) {
  const { choices, moveTo } = useSectionChoices(task);
  if (choices.length === 0) return null;
  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger>
        <Rows3 aria-hidden /> Move to section
      </ContextMenuSubTrigger>
      <ContextMenuSubContent>
        {choices.map(({ id, name }) => (
          <ContextMenuItem
            key={id ?? "none"}
            disabled={task.section_id === id}
            onSelect={() => {
              moveTo(id);
            }}
          >
            {name}
          </ContextMenuItem>
        ))}
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}
