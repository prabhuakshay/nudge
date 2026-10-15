import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ListTodo } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { ProjectIcon } from "@/features/projects/project-icon";
import { allProjects } from "@/features/projects/projects";
import { useOpenTask } from "@/features/tasks/open-task";
import { QuickAddCard } from "@/features/tasks/quick-add-card";
import { TaskDetail } from "@/features/tasks/task-detail";
import { ClosedGroup, Group, TaskTableHeader } from "@/features/tasks/task-list";
import { isClosed } from "@/features/tasks/task-properties";
import { TreeRows, type RowContext, type ToggleStatus } from "@/features/tasks/task-row";
import type { TreeRow } from "@/features/tasks/task-tree";
import { sidebarQuery, useSetTaskStatus, type Task } from "@/features/tasks/tasks";
import { useMediaQuery } from "@/lib/use-media-query";

import { groupByProject } from "./group-by-project";
import { TagHeader } from "./tag-header";
import { closedTagTasksQuery, tagTasksQuery, type SidebarTag } from "./tags";

/** A Tag's list shows every Task flat, a Subtask with its parent's title rather than nested. */
function flatRows(tasks: Task[]): TreeRow[] {
  return tasks.map((task) => ({ task, level: 0, subtasks: { done: 0, total: 0 } }));
}

const NO_COLLAPSED: ReadonlySet<number> = new Set();

/**
 * A Tag's Tasks across Projects as a table: the page header, Quick add, the open Tasks grouped by
 * Project in sidebar order, then a collapsed Closed group. Quick add files new Tasks in the Inbox
 * with the Tag. Clicking a row opens the Task in the drawer, and the URL's `?task=` follows it.
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
  const order = useMemo(
    () => [...groups.flatMap((group) => group.tasks), ...closedTasks].map((task) => task.id),
    [groups, closedTasks],
  );
  const { openTaskId: openId, setOpenTask: setOpenId } = useOpenTask();
  const touch = useMediaQuery("(pointer: coarse)");
  const { mutate: setStatus } = useSetTaskStatus();
  // Stable, so memoized rows don't re-render when the list does.
  const toggle = useCallback<ToggleStatus>(
    (task) => {
      setStatus({ task, status: isClosed(task.status) ? "open" : "completed" });
    },
    [setStatus],
  );
  const context = useMemo<RowContext>(
    () => ({
      openId,
      collapsed: NO_COLLAPSED,
      indent: 0,
      contextMenu: !touch,
      onToggle: toggle,
      onOpen: setOpenId,
      onToggleCollapsed: () => undefined,
    }),
    [openId, touch, toggle, setOpenId],
  );

  return (
    // `data-wide` lets the app shell drop its reading width for this table.
    <div data-wide className="mx-auto w-full max-w-6xl">
      <TagHeader tag={tag} />

      {sidebar && <QuickAddCard projectId={sidebar.inbox.id} tagId={tag.id} />}

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
          rows={flatRows(closedTasks)}
          expanded={showClosed}
          onExpandedChange={setShowClosed}
          context={context}
        />
      </div>

      {sidebar && (
        <TaskDetail
          taskId={openId}
          project={sidebar.inbox}
          order={order}
          onOpen={setOpenId}
          onClose={() => {
            setOpenId(null);
          }}
        />
      )}
    </div>
  );
}
