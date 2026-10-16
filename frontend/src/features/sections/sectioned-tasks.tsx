import { ListTodo } from "lucide-react";

import { Group } from "@/features/tasks/task-groups";
import { SortableTaskRows, type SortableRowContext } from "@/features/tasks/task-rows";
import { rootCount } from "@/features/tasks/task-tree";

import { MoveSectionItems } from "./move-section-items";
import { SectionGroup } from "./section-group";
import { SectionMenu } from "./section-menu";
import type { SectionTrees } from "./section-trees";

/**
 * A Project's open Tasks grouped by Section: No section first, left out when it is empty, then
 * each Section's header with its Tasks under it.
 */
export function SectionedTasks({
  trees,
  context,
}: {
  trees: SectionTrees;
  context: SortableRowContext;
}) {
  const order = trees.sections.map(({ section }) => section);
  return (
    <>
      {trees.unsectioned.length > 0 && (
        <Group
          icon={<ListTodo className="size-3.5 text-muted-foreground" aria-hidden />}
          label="No section"
          count={rootCount(trees.unsectioned)}
        >
          <SortableTaskRows tasks={trees.unsectioned} context={context} />
        </Group>
      )}
      {trees.sections.map(({ section, tasks }) => (
        <SectionGroup
          key={section.id}
          section={section}
          count={rootCount(tasks)}
          actions={
            context.sortable && (
              <SectionMenu section={section}>
                <MoveSectionItems section={section} order={order} />
              </SectionMenu>
            )
          }
        >
          {tasks.length > 0 && <SortableTaskRows tasks={tasks} context={context} />}
        </SectionGroup>
      ))}
    </>
  );
}
