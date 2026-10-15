import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { ProjectIcon } from "@/features/projects/project-icon";
import { allProjects } from "@/features/projects/projects";
import { TaskDetail } from "@/features/tasks/task-detail";
import { ClosedGroup, Group, TaskTableHeader } from "@/features/tasks/task-list";
import { TaskRow, type ToggleStatus } from "@/features/tasks/task-row";
import { isClosed } from "@/features/tasks/task-properties";
import {
  sidebarQuery,
  useSetTaskStatus,
  type SidebarProject,
  type Task,
} from "@/features/tasks/tasks";

import { PersonAvatar } from "./person-avatar";
import { personClosedTasksQuery, personTasksQuery, type Person } from "./people";

/** A Project's open Tasks that mention the Person, in the Project's manual order. */
type ProjectGroup = { project: SidebarProject; tasks: Task[] };

/** Group Tasks by Project in sidebar order, keeping the server's order within each Project. */
function byProject(tasks: Task[], projects: SidebarProject[]): ProjectGroup[] {
  return projects
    .map((project) => ({
      project,
      tasks: tasks.filter((task) => task.project_id === project.id),
    }))
    .filter((group) => group.tasks.length > 0);
}

/**
 * A Person's view: every open Task that mentions them, grouped by Project in sidebar order, then
 * a collapsed Closed group. Rows are flat, and open in the drawer like any list's.
 */
export function PersonTasks({ person }: { person: Person }) {
  const { data: open = [] } = useQuery(personTasksQuery(person.id));
  const { data: sidebar } = useQuery(sidebarQuery);
  const [showClosed, setShowClosed] = useState(false);
  const closed = useInfiniteQuery({ ...personClosedTasksQuery(person.id), enabled: showClosed });
  const closedTasks = useMemo(
    () => (showClosed ? (closed.data?.pages.flatMap((page) => page.items) ?? []) : []),
    [showClosed, closed.data],
  );
  const groups = useMemo(
    () => (sidebar ? byProject(open, allProjects(sidebar)) : []),
    [open, sidebar],
  );
  const order = useMemo(
    () => [...groups.flatMap((group) => group.tasks), ...closedTasks].map((task) => task.id),
    [groups, closedTasks],
  );
  const [openId, setOpenId] = useState<number | null>(null);
  const { mutate: setStatus } = useSetTaskStatus();
  // Stable, so memoized rows don't re-render when the list does.
  const toggle = useCallback<ToggleStatus>(
    (task) => {
      setStatus({ task, status: isClosed(task.status) ? "open" : "completed" });
    },
    [setStatus],
  );

  return (
    // `data-wide` lets the app shell drop its reading width for this table.
    <div data-wide className="mx-auto w-full max-w-6xl">
      <header className="mb-4 flex items-center gap-2.5 sm:gap-3">
        <PersonAvatar person={person} size="md" className="size-9 text-sm" />
        <h1 className="min-w-0 truncate text-2xl font-extrabold tracking-tight sm:text-3xl">
          {person.name}
        </h1>
        <Badge variant="secondary" className="shrink-0 tabular-nums">
          {open.length} open
        </Badge>
      </header>

      <div
        role="treegrid"
        aria-label={`Tasks mentioning ${person.name}`}
        className="rounded-xl border border-border bg-surface shadow-sm"
      >
        <TaskTableHeader />

        {groups.length === 0 && (
          <p className="border-b border-border px-4 py-8 text-center text-sm text-muted-foreground">
            No open tasks mention {person.name}.
          </p>
        )}
        {groups.map(({ project, tasks }) => (
          <Group
            key={project.id}
            icon={<ProjectIcon project={project} className="size-3.5" />}
            label={project.name}
            count={tasks.length}
          >
            {tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                selected={task.id === openId}
                onToggle={toggle}
                onOpen={setOpenId}
              />
            ))}
          </Group>
        ))}

        <ClosedGroup
          query={closed}
          tasks={closedTasks}
          expanded={showClosed}
          onExpandedChange={setShowClosed}
          openId={openId}
          onToggle={toggle}
          onOpen={setOpenId}
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
