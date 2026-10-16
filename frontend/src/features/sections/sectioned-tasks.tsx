import { ListTodo } from "lucide-react";
import { useCallback, useMemo, useState, type ReactNode } from "react";

import type { GroupHeader } from "@/features/tasks/sortable-tree";
import { Group } from "@/features/tasks/task-groups";
import {
  SortableTaskGroups,
  type RenderTaskGroup,
  type SortableRowContext,
  type TaskGroup,
} from "@/features/tasks/task-rows";
import { rootCount } from "@/features/tasks/task-tree";

import { AddSectionTask, AddSectionTaskButton } from "./add-section-task";
import { DeleteSectionDialog, DeleteSectionItem } from "./delete-section";
import { MoveSectionItems } from "./move-section-items";
import { SectionGroup } from "./section-group";
import type { SectionTrees } from "./section-trees";
import type { Section } from "./sections";

/**
 * A Project's open Tasks grouped by Section: No section first, left out when it is empty, then
 * each Section's header with its Tasks under it. Dragging a Task past a header moves it into
 * that Section, and above the first one into No section.
 */
export function SectionedTasks({
  trees,
  context,
}: {
  trees: SectionTrees;
  context: SortableRowContext;
}) {
  const order = useMemo(() => trees.sections.map(({ section }) => section), [trees]);
  const groups = useMemo<TaskGroup[]>(
    () => [
      { sectionId: null, tasks: trees.unsectioned },
      ...trees.sections.map(({ section, tasks }) => ({ sectionId: section.id, tasks })),
    ],
    [trees],
  );
  const renderGroup = useCallback<RenderTaskGroup>(
    ({ sectionId, tasks }, header, rows) => {
      const section = order.find(({ id }) => id === sectionId);
      if (!section) {
        return (
          tasks.length > 0 && (
            <Group
              icon={<ListTodo className="size-3.5 text-muted-foreground" aria-hidden />}
              label="No section"
              count={rootCount(tasks)}
            >
              {rows}
            </Group>
          )
        );
      }
      return (
        <SectionTasks
          section={section}
          count={rootCount(tasks)}
          order={order}
          header={header}
          editable={context.sortable}
        >
          {rows}
        </SectionTasks>
      );
    },
    [order, context.sortable],
  );
  return <SortableTaskGroups groups={groups} renderGroup={renderGroup} context={context} />;
}

/**
 * One Section's header and its Tasks, with the field for adding one when it's open. The dialogs
 * its menu opens sit beside the menu, so they outlive it closing.
 */
function SectionTasks({
  section,
  count,
  order,
  header,
  editable,
  children,
}: {
  section: Section;
  count: number;
  order: Section[];
  header: GroupHeader | null;
  /** False where the list can't change, as in an archived Project. */
  editable: boolean;
  /** The Section's Task rows. */
  children: ReactNode;
}) {
  const [adding, setAdding] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  return (
    <SectionGroup
      section={section}
      count={count}
      readOnly={!editable}
      header={header}
      actions={
        editable && (
          <>
            <AddSectionTaskButton
              section={section}
              open={adding}
              onOpen={() => {
                setAdding(true);
              }}
            />
            <DeleteSectionDialog
              section={section}
              open={confirmingDelete}
              onOpenChange={setConfirmingDelete}
            />
          </>
        )
      }
      menuItems={
        <>
          <MoveSectionItems section={section} order={order} />
          <DeleteSectionItem
            onSelect={() => {
              setConfirmingDelete(true);
            }}
          />
        </>
      }
    >
      {adding && (
        <AddSectionTask
          section={section}
          onClose={() => {
            setAdding(false);
          }}
        />
      )}
      {children}
    </SectionGroup>
  );
}
