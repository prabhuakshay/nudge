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
 * Where a root Task can move within its Project: No section, then each Section, leaving out the
 * one it is in. Empty for a
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
    canMove && sections.length > 0
      ? [{ id: null, name: "No section" }, ...sections].filter(({ id }) => id !== task.section_id)
      : [];
  return {
    choices,
    moveTo: (sectionId: number | null) => {
      move({ taskId: task.id, parentId: null, afterId: null, sectionId });
    },
  };
}

/** The parts each kind of menu builds a submenu from. */
const MENU_PARTS = {
  dropdown: {
    Sub: DropdownMenuSub,
    Trigger: DropdownMenuSubTrigger,
    Content: DropdownMenuSubContent,
    Item: DropdownMenuItem,
  },
  context: {
    Sub: ContextMenuSub,
    Trigger: ContextMenuSubTrigger,
    Content: ContextMenuSubContent,
    Item: ContextMenuItem,
  },
};

/**
 * The Task's "Move to section" submenu, in its ⋯ (`dropdown`) or right-click (`context`) menu;
 * nothing when it can't move.
 */
export function MoveToSectionSub({ task, menu }: { task: Task; menu: keyof typeof MENU_PARTS }) {
  const { choices, moveTo } = useSectionChoices(task);
  const { Sub, Trigger, Content, Item } = MENU_PARTS[menu];
  if (choices.length === 0) return null;
  return (
    <Sub>
      <Trigger>
        <Rows3 aria-hidden /> Move to section
      </Trigger>
      <Content>
        {choices.map(({ id, name }) => (
          <Item
            key={id ?? "none"}
            onSelect={() => {
              moveTo(id);
            }}
          >
            {name}
          </Item>
        ))}
      </Content>
    </Sub>
  );
}
