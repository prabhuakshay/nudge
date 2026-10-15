import { useInfiniteQuery, useQuery, type UseInfiniteQueryResult } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, CircleCheck, ListTodo, Pin } from "lucide-react";
import { useCallback, useMemo, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { ArchivedNotice } from "@/features/projects/archived-notice";
import { ProjectHeader } from "@/features/projects/project-header";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

import { ExpandCollapse } from "./expand-collapse";
import { useOpenTask } from "./open-task";
import { QuickAddCard } from "./quick-add-card";
import { TaskDetail } from "./task-detail";
import { useRowContext } from "./row-context";
import type { Placement } from "./task-drag";
import { useMoveTask } from "./task-placement";
import { GRID, type ToggleCollapsed } from "./task-row";
import { SortableTaskRows, type SortableRowContext } from "./task-rows";
import { parentsOf, treeRows, treesWhere } from "./task-tree";
import { closedTasksQuery, openTasksQuery, type SidebarProject, type Task } from "./tasks";

/**
 * A Project's Tasks as a table: the page header, Quick add, then the pinned Task trees, the other
 * open trees and a collapsed Closed group. Subtasks nest under their parent and fold away from
 * its chevron; dragging a row, or Tab and Alt+↑/↓, reorders and nests it. On phones the table
 * collapses into stacked rows. Clicking a row opens the Task in
 * the drawer, and the URL's `?task=` follows the open Task. An archived Project's list is
 * read-only: a notice replaces Quick add and every control that changes a Task is disabled.
 */
export function TaskList({ project }: { project: SidebarProject }) {
  const { data: open = [] } = useQuery(openTasksQuery(project.id));
  const pinned = useMemo(() => treesWhere(open, (root) => root.pinned_at !== null), [open]);
  const unpinned = useMemo(() => treesWhere(open, (root) => root.pinned_at === null), [open]);
  const [showClosed, setShowClosed] = useState(false);
  const closed = useInfiniteQuery({ ...closedTasksQuery(project.id), enabled: showClosed });
  const closedTasks = useMemo(
    () => (showClosed ? (closed.data?.pages.flatMap((page) => page.items) ?? []) : []),
    [showClosed, closed.data],
  );
  const [collapsed, setCollapsed] = useState<ReadonlySet<number>>(new Set());
  const parents = useMemo(() => parentsOf([...open, ...closedTasks]), [open, closedTasks]);
  // J/K step through every Task in outline order, folded or not, as in the prototype.
  const order = useMemo(
    () =>
      [pinned, unpinned, closedTasks].flatMap((rows) => treeRows(rows).map((row) => row.task.id)),
    [pinned, unpinned, closedTasks],
  );
  const { openTaskId: openId, setOpenTask: setOpenId } = useOpenTask();
  const touch = useMediaQuery("(pointer: coarse)");
  const { mutate: move } = useMoveTask();
  const moveTask = useCallback(
    (taskId: number, placement: Placement) => {
      // A Task moved under a folded parent would vanish, so the parent unfolds.
      setCollapsed((current) => {
        if (placement.parentId === null || !current.has(placement.parentId)) return current;
        const next = new Set(current);
        next.delete(placement.parentId);
        return next;
      });
      move({ taskId, ...placement });
    },
    [move],
  );
  const toggleCollapsed = useCallback<ToggleCollapsed>((taskId) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(taskId)) next.add(taskId);
      return next;
    });
  }, []);
  const rowContext = useRowContext({
    collapsed,
    onToggleCollapsed: toggleCollapsed,
    readOnly: project.is_archived,
  });
  const context = useMemo<SortableRowContext>(
    () => ({
      ...rowContext,
      touch,
      // An archived Project is read-only, so its rows stay put.
      sortable: !project.is_archived,
      onMove: moveTask,
    }),
    [rowContext, touch, project.is_archived, moveTask],
  );

  return (
    // `data-wide` lets the app shell drop its reading width for this table.
    <div data-wide className="mx-auto w-full max-w-6xl">
      <ProjectHeader project={project}>
        {parents.length > 0 && (
          <ExpandCollapse
            onExpand={() => {
              setCollapsed(new Set());
            }}
            onCollapse={() => {
              setCollapsed(new Set(parents));
            }}
          />
        )}
      </ProjectHeader>

      {project.is_archived ? (
        <ArchivedNotice project={project} />
      ) : (
        <QuickAddCard projectId={project.id} />
      )}

      {/* A disabled fieldset disables every control inside, while rows still open the drawer. */}
      <fieldset disabled={project.is_archived} className="min-w-0">
        <div
          role="treegrid"
          aria-label={`${project.name} tasks`}
          className="rounded-xl border border-border bg-surface shadow-sm"
        >
          <TaskTableHeader />

          {pinned.length > 0 && (
            <Group
              icon={<Pin className="size-3.5 text-primary" aria-hidden />}
              label="Pinned"
              count={rootCount(pinned)}
            >
              <SortableTaskRows tasks={pinned} context={context} />
            </Group>
          )}

          <Group
            icon={<ListTodo className="size-3.5 text-muted-foreground" aria-hidden />}
            label="Tasks"
            count={rootCount(unpinned)}
          >
            {unpinned.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                Nothing left here. Add a task above.
              </p>
            ) : (
              <SortableTaskRows tasks={unpinned} context={context} />
            )}
          </Group>

          <ClosedGroup
            query={closed}
            empty={closedTasks.length === 0}
            expanded={showClosed}
            onExpandedChange={setShowClosed}
          >
            <SortableTaskRows tasks={closedTasks} context={context} />
          </ClosedGroup>
        </div>
      </fieldset>

      {!project.is_archived && (
        <p className="mt-3 hidden items-center gap-3 text-[11px] text-muted-foreground lg:flex">
          <span>
            <Kbd>Enter</Kbd> open
          </span>
          <span>
            <Kbd>Tab</Kbd> nest
          </span>
          <span>
            <Kbd>Alt</Kbd>+<Kbd>↑</Kbd> reorder
          </span>
          <span>Drag a row sideways to change nesting</span>
        </p>
      )}

      <TaskDetail
        taskId={openId}
        project={project}
        order={order}
        onOpen={setOpenId}
        onClose={() => {
          setOpenId(null);
        }}
      />
    </div>
  );
}

function rootCount(tasks: Task[]) {
  return tasks.filter((task) => task.parent_id === null).length;
}

/** The table's column headings, shown from `lg` where the rows become a grid. */
export function TaskTableHeader() {
  return (
    <div
      role="row"
      className={cn(
        GRID,
        "sticky top-14 z-10 hidden h-9 items-center rounded-t-xl border-b border-border bg-surface-muted/95 pr-2 pl-3 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase backdrop-blur",
      )}
    >
      <span role="columnheader" className="pl-[54px]">
        Title
      </span>
      <span role="columnheader" className="px-2">
        Status
      </span>
      <span role="columnheader" className="px-2">
        Priority
      </span>
      <span role="columnheader" className="px-2">
        Due
      </span>
      <span role="columnheader" className="px-2 text-right">
        Activity
      </span>
      <span role="columnheader" aria-label="Actions" />
    </div>
  );
}

/** A titled section of the table, with a count of the Tasks in it. */
export function Group({
  icon,
  label,
  hint,
  count,
  children,
}: {
  icon: ReactNode;
  label: string;
  /** Quieter text after the label, such as a weekday's date. */
  hint?: string | null;
  count: number;
  children: ReactNode;
}) {
  return (
    <section aria-label={label} className="border-b border-border">
      <h2 className="flex h-9 items-center gap-2 border-b border-border/70 bg-surface-muted/50 px-3 text-xs font-semibold text-foreground">
        {icon}
        {label}
        {hint && <span className="font-normal text-muted-foreground">{hint}</span>}
        <span className="rounded-full bg-surface px-1.5 py-px text-[11px] font-medium text-muted-foreground tabular-nums ring-1 ring-border">
          {count}
        </span>
      </h2>
      {children}
    </section>
  );
}

/**
 * Closed Tasks stay out of the way, and aren't fetched, until the group is opened. `children` are
 * its rows; `empty` says there are none once loaded.
 */
export function ClosedGroup({
  label = "Closed",
  query: closed,
  empty,
  expanded,
  onExpandedChange,
  children,
}: {
  label?: string;
  query: UseInfiniteQueryResult;
  empty: boolean;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  children: ReactNode;
}) {
  return (
    <section aria-label={label}>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => {
          onExpandedChange(!expanded);
        }}
        className={cn(
          "flex h-10 w-full items-center gap-2 px-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-surface-muted/60 hover:text-foreground",
          !expanded && "rounded-b-xl",
        )}
      >
        {expanded ? (
          <ChevronDown className="size-4" aria-hidden />
        ) : (
          <ChevronRight className="size-4" aria-hidden />
        )}
        <CircleCheck className="size-3.5 text-success" aria-hidden />
        {label}
      </button>
      {expanded && (
        <div className="border-t border-border/60 pb-1">
          {children}
          {closed.isSuccess && empty && (
            <p className="px-4 py-4 text-center text-sm text-muted-foreground">
              Nothing closed yet.
            </p>
          )}
          {closed.hasNextPage && (
            <div className="flex justify-center py-1">
              <Button
                variant="ghost"
                disabled={closed.isFetchingNextPage}
                onClick={() => void closed.fetchNextPage()}
              >
                Show more
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
