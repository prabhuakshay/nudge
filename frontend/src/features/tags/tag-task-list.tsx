import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ListTodo } from "lucide-react";
import { useMemo, useState } from "react";

import { ProjectIcon } from "@/features/projects/project-icon";
import { allProjects } from "@/features/projects/projects";
import { useOpenTask } from "@/features/tasks/open-task";
import { QuickAddCard } from "@/features/tasks/quick-add-card";
import { useRowContext } from "@/features/tasks/row-context";
import { TaskDetail } from "@/features/tasks/task-detail";
import { ClosedGroup, Group, TaskTableHeader } from "@/features/tasks/task-list";
import { TreeRows } from "@/features/tasks/task-row";
import { flatRows } from "@/features/tasks/task-tree";
import { sidebarQuery } from "@/features/tasks/tasks";

import { groupByProject } from "./group-by-project";
import { TagHeader } from "./tag-header";
import { closedTagTasksQuery, tagTasksQuery, type SidebarTag } from "./tags";

/** Folding is for trees; a Tag's list is flat, so nothing is ever folded. */
const NONE_FOLDED: ReadonlySet<number> = new Set();
const ignoreFold = () => undefined;

/**
 * A Tag's Tasks across Projects as a table: the page header, Quick add, the open Tasks grouped by
 * Project in sidebar order, then a collapsed Closed group. Rows are flat, a Subtask naming its
 * parent under its title. Quick add files new Tasks in the Inbox with the Tag. Clicking a row
 * opens the Task in the drawer, and the URL's `?task=` follows it.
 */
export function TagTaskList({ tag }: { tag: SidebarTag }) {
  const { data: sidebar } = useQuery(sidebarQuery);
  const { data: open = [] } = useQuery(tagTasksQuery(tag.id));
  const [showClosed, setShowClosed] = useState(false);
  const closed = useInfiniteQuery({ ...closedTagTasksQuery(tag.id), enabled: showClosed });
  const closedTasks = useMemo(
    () => (showClosed ? (closed.data?.pages.flatMap((page) => page.items) ?? []) : []),
    [showClosed, closed.data],
  );
  const groups = useMemo(
    () => (sidebar ? groupByProject(open, allProjects(sidebar)) : []),
    [open, sidebar],
  );
  const order = [...groups.flatMap((group) => group.tasks), ...closedTasks].map((task) => task.id);
  const { openTaskId, setOpenTask } = useOpenTask();
  const context = useRowContext({ collapsed: NONE_FOLDED, onToggleCollapsed: ignoreFold });

  return (
    // `data-wide` lets the app shell drop its reading width for this table.
    <div data-wide className="mx-auto w-full max-w-6xl">
      <TagHeader tag={tag} />

      <QuickAddCard view={{ kind: "tag", tag }} />

      <div
        role="treegrid"
        aria-label={`#${tag.name} tasks`}
        className="rounded-xl border border-border bg-surface shadow-sm"
      >
        <TaskTableHeader />

        {groups.length === 0 ? (
          <Group
            icon={<ListTodo className="size-3.5 text-muted-foreground" aria-hidden />}
            label="Tasks"
            count={0}
          >
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              Nothing tagged #{tag.name} is left. Add a task above.
            </p>
          </Group>
        ) : (
          groups.map(({ project, tasks }) => (
            <Group
              key={project.id}
              icon={<ProjectIcon project={project} className="size-3.5" />}
              label={project.name}
              count={tasks.length}
            >
              <TreeRows rows={flatRows(tasks)} context={context} />
            </Group>
          ))
        )}

        <ClosedGroup
          query={closed}
          empty={closedTasks.length === 0}
          expanded={showClosed}
          onExpandedChange={setShowClosed}
        >
          <TreeRows rows={flatRows(closedTasks)} context={context} />
        </ClosedGroup>
      </div>

      {sidebar && (
        <TaskDetail
          taskId={openTaskId}
          project={sidebar.inbox}
          order={order}
          onOpen={setOpenTask}
          onClose={() => {
            setOpenTask(null);
          }}
        />
      )}
    </div>
  );
}
