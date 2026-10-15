import { useInfiniteQuery, useQuery, type UseInfiniteQueryResult } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, CircleCheck, ListTodo } from "lucide-react";
import { useCallback, useMemo, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { ProjectHeader } from "@/features/projects/project-header";
import { cn } from "@/lib/utils";

import { QuickAddCard } from "./quick-add-card";
import { TaskDetail } from "./task-detail";
import { GRID, TaskRow, type OpenTask, type ToggleStatus } from "./task-row";
import { isClosed } from "./task-properties";
import {
  closedTasksQuery,
  openTasksQuery,
  useSetTaskStatus,
  type SidebarProject,
  type Task,
} from "./tasks";

/**
 * A Project's Tasks as a table: the page header, Quick add, then the open Tasks and a collapsed
 * Closed group. On phones the table collapses into stacked rows. Clicking a row opens the Task in
 * the drawer.
 */
export function TaskList({ project }: { project: SidebarProject }) {
  const { data: open = [] } = useQuery(openTasksQuery(project.id));
  const [showClosed, setShowClosed] = useState(false);
  const closed = useInfiniteQuery({ ...closedTasksQuery(project.id), enabled: showClosed });
  const closedTasks = useMemo(
    () => (showClosed ? (closed.data?.pages.flatMap((page) => page.items) ?? []) : []),
    [showClosed, closed.data],
  );
  const order = useMemo(
    () => [...open, ...closedTasks].map((task) => task.id),
    [open, closedTasks],
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
      <ProjectHeader project={project} />

      <QuickAddCard projectId={project.id} />

      <div
        role="treegrid"
        aria-label={`${project.name} tasks`}
        className="rounded-xl border border-border bg-surface shadow-sm"
      >
        <div
          role="row"
          className={cn(
            GRID,
            "sticky top-14 z-10 hidden h-9 items-center rounded-t-xl border-b border-border bg-surface-muted/95 pr-2 pl-3 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase backdrop-blur",
          )}
        >
          <span role="columnheader" className="pl-7">
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
        </div>

        <Group
          icon={<ListTodo className="size-3.5 text-muted-foreground" aria-hidden />}
          label="Tasks"
          count={open.length}
        >
          {open.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              Nothing left here. Add a task above.
            </p>
          ) : (
            open.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                selected={task.id === openId}
                onToggle={toggle}
                onOpen={setOpenId}
              />
            ))
          )}
        </Group>

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

function Group({
  icon,
  label,
  count,
  children,
}: {
  icon: ReactNode;
  label: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <section aria-label={label} className="border-b border-border">
      <h2 className="flex h-9 items-center gap-2 border-b border-border/70 bg-surface-muted/50 px-3 text-xs font-semibold text-foreground">
        {icon}
        {label}
        <span className="rounded-full bg-surface px-1.5 py-px text-[11px] font-medium text-muted-foreground tabular-nums ring-1 ring-border">
          {count}
        </span>
      </h2>
      {children}
    </section>
  );
}

/** Closed Tasks stay out of the way, and aren't fetched, until the group is opened. */
function ClosedGroup({
  query: closed,
  tasks,
  expanded,
  onExpandedChange,
  openId,
  onToggle,
  onOpen,
}: {
  query: UseInfiniteQueryResult;
  tasks: Task[];
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  openId: number | null;
  onToggle: ToggleStatus;
  onOpen: OpenTask;
}) {
  return (
    <section aria-label="Closed">
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
        Closed
      </button>
      {expanded && (
        <div className="border-t border-border/60 pb-1">
          {tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              selected={task.id === openId}
              onToggle={onToggle}
              onOpen={onOpen}
            />
          ))}
          {closed.isSuccess && tasks.length === 0 && (
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
