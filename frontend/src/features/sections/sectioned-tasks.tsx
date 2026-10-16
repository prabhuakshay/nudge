import { ListTodo } from "lucide-react";
import { useState } from "react";

import { Group } from "@/features/tasks/task-groups";
import { SortableTaskRows, type SortableRowContext } from "@/features/tasks/task-rows";
import { rootCount } from "@/features/tasks/task-tree";

import { AddSectionTask, AddSectionTaskButton } from "./add-section-task";
import { MoveSectionItems } from "./move-section-items";
import { SectionGroup } from "./section-group";
import { SectionMenu } from "./section-menu";
import type { SectionTrees } from "./section-trees";
import type { Section } from "./sections";

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
        <SectionTasks
          key={section.id}
          section={section}
          tasks={tasks}
          order={order}
          context={context}
        />
      ))}
    </>
  );
}

/** One Section's header and its Tasks, with the field for adding one when it's open. */
function SectionTasks({
  section,
  tasks,
  order,
  context,
}: {
  section: Section;
  tasks: SectionTrees["unsectioned"];
  order: Section[];
  context: SortableRowContext;
}) {
  const [adding, setAdding] = useState(false);
  return (
    <SectionGroup
      section={section}
      count={rootCount(tasks)}
      actions={
        context.sortable && (
          <>
            <AddSectionTaskButton
              section={section}
              open={adding}
              onOpen={() => {
                setAdding(true);
              }}
            />
            <SectionMenu section={section}>
              <MoveSectionItems section={section} order={order} />
            </SectionMenu>
          </>
        )
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
      {tasks.length > 0 && <SortableTaskRows tasks={tasks} context={context} />}
    </SectionGroup>
  );
}
