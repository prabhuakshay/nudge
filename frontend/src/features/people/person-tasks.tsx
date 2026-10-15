import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { ProjectIcon } from "@/features/projects/project-icon";
import { allProjects } from "@/features/projects/projects";
import { useOpenTask } from "@/features/tasks/open-task";
import { TaskDetail } from "@/features/tasks/task-detail";
import { ClosedGroup, Group, TaskTableHeader } from "@/features/tasks/task-list";
import { useRowContext } from "@/features/tasks/row-context";
import { TreeRows } from "@/features/tasks/task-row";
import { flatRows } from "@/features/tasks/task-tree";
import { sidebarQuery, type SidebarProject, type Task } from "@/features/tasks/tasks";

import { PersonAvatar } from "./person-avatar";
import { personClosedTasksQuery, personTasksQuery, type Person } from "./people";

/** A Person's view never nests or folds rows, so nothing is ever collapsed. */
const NOTHING_COLLAPSED: ReadonlySet<number> = new Set();
const ignoreFold = () => undefined;

/** Group Tasks by Project in sidebar order, keeping the server's order within each Project. */
function byProject(tasks: Task[], projects: SidebarProject[]) {
  return projects
    .map((project) => ({
      project,
      rows: flatRows(tasks.filter((task) => task.project_id === project.id)),
    }))
    .filter((group) => group.rows.length > 0);
}

/**
 * A Person's view: every open Task that mentions them, flat and grouped by Project in sidebar
 * order, then a collapsed Closed group. Rows open in the drawer like any list's, and the URL's
 * `?task=` follows the open Task.
 */
export function PersonTasks({ person }: { person: Person }) {
  const { data: open = [] } = useQuery(personTasksQuery(person.id));
  const { data: sidebar } = useQuery(sidebarQuery);
  const [showClosed, setShowClosed] = useState(false);
  const closed = useInfiniteQuery({ ...personClosedTasksQuery(person.id), enabled: showClosed });
  const closedRows = useMemo(
    () => flatRows(showClosed ? (closed.data?.pages.flatMap((page) => page.items) ?? []) : []),
    [showClosed, closed.data],
  );
  const groups = useMemo(
    () => (sidebar ? byProject(open, allProjects(sidebar)) : []),
    [open, sidebar],
  );
  const order = useMemo(
    () => [...groups.flatMap((group) => group.rows), ...closedRows].map((row) => row.task.id),
    [groups, closedRows],
  );
  const { openTaskId: openId, setOpenTask: setOpenId } = useOpenTask();
  const context = useRowContext({ collapsed: NOTHING_COLLAPSED, onToggleCollapsed: ignoreFold });

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
        {groups.map(({ project, rows }) => (
          <Group
            key={project.id}
            icon={<ProjectIcon project={project} className="size-3.5" />}
            label={project.name}
            count={rows.length}
          >
            <TreeRows rows={rows} context={context} />
          </Group>
        ))}

        <ClosedGroup
          query={closed}
          rows={closedRows}
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
