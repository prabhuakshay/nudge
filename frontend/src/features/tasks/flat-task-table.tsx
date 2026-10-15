import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ListTodo } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import { ProjectIcon } from "@/features/projects/project-icon";
import { allProjects } from "@/features/projects/projects";

import { groupByProject } from "./group-by-project";
import { useOpenTask } from "./open-task";
import { QuickAddCard } from "./quick-add-card";
import type { QuickAddView } from "./quick-add-view";
import { useRowContext } from "./row-context";
import { SelectionBar } from "./selection-bar";
import { TaskDetail } from "./task-detail";
import { ClosedGroup, Group, TaskTableHeader } from "./task-list";
import { TreeRows } from "./task-row";
import { flatRows } from "./task-tree";
import { closedPagesQuery, sidebarQuery, type ListSource, type Task } from "./tasks";

/** Folding is for trees; these lists are flat, so nothing is ever folded. */
const NONE_FOLDED: ReadonlySet<number> = new Set();
const ignoreFold = () => undefined;

/**
 * A list of Tasks across Projects, as a Tag or a Person shows them: the page header, Quick add,
 * the open Tasks grouped by Project in sidebar order, then a collapsed Closed group. Rows are
 * flat, a Subtask naming its parent under its title. Clicking a row opens the Task in the drawer,
 * and the URL's `?task=` follows it.
 */
export function FlatTaskTable({
  label,
  header,
  quickAdd,
  open,
  source,
  empty,
}: {
  /** The table's accessible name. */
  label: string;
  header: ReactNode;
  /** Where Quick add puts new Tasks, so they show in this list. */
  quickAdd: QuickAddView;
  /** The open Tasks, in the server's order. */
  open: Task[];
  /** Where the Closed Tasks come from. */
  source: ListSource;
  /** What the list says when no open Task is left. */
  empty: string;
}) {
  const { data: sidebar } = useQuery(sidebarQuery);
  const [showClosed, setShowClosed] = useState(false);
  const closed = useInfiniteQuery({ ...closedPagesQuery(source), enabled: showClosed });
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
      {header}

      <QuickAddCard view={quickAdd} />

      <div
        role="treegrid"
        aria-label={label}
        className="rounded-xl border border-border bg-surface shadow-sm"
      >
        <TaskTableHeader />

        {groups.length === 0 ? (
          <Group
            icon={<ListTodo className="size-3.5 text-muted-foreground" aria-hidden />}
            label="Tasks"
            count={0}
          >
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">{empty}</p>
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

      <SelectionBar tasks={[...open, ...closedTasks]} context={context} />

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
