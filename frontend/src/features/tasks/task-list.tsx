import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, CircleCheck, Inbox, ListTodo } from "lucide-react";
import { memo, useCallback, useState, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { QuickAddCard } from "./quick-add-card";
import { StatusBadge } from "./status-badge";
import { TaskCheckbox } from "./task-checkbox";
import {
  closedTasksQuery,
  openTasksQuery,
  useSetTaskStatus,
  type SidebarProject,
  type Task,
  type TaskStatus,
} from "./tasks";

/** One grid for the header and every row, so the columns line up from `lg`. */
const GRID = "lg:grid lg:grid-cols-[minmax(0,1fr)_7.5rem]";

type ToggleStatus = (task: Task) => void;

/**
 * A Project's Tasks as a table: the page header, Quick add, then the open Tasks and a collapsed
 * Closed group. On phones the table collapses into stacked rows.
 */
export function TaskList({ project }: { project: SidebarProject }) {
  const { data: open = [] } = useQuery(openTasksQuery(project.id));
  const { mutate: setStatus } = useSetTaskStatus(project.id);
  // Stable, so memoized rows don't re-render when the list does.
  const toggle = useCallback<ToggleStatus>(
    (task) => {
      const status: TaskStatus = task.status === "open" ? "completed" : "open";
      setStatus({ id: task.id, status });
    },
    [setStatus],
  );

  return (
    // `data-wide` lets the app shell drop its reading width for this table.
    <div data-wide className="mx-auto w-full max-w-6xl">
      <header className="mb-4 flex items-center gap-2.5 sm:gap-3">
        <span className="flex size-9 items-center justify-center rounded-lg bg-hue-blue-soft text-hue-blue">
          <Inbox className="size-5" aria-hidden />
        </span>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{project.name}</h1>
        <Badge variant="secondary" className="tabular-nums">
          {project.open_count} open
        </Badge>
      </header>

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
            open.map((task) => <TaskRow key={task.id} task={task} onToggle={toggle} />)
          )}
        </Group>

        <ClosedGroup projectId={project.id} onToggle={toggle} />
      </div>
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
function ClosedGroup({ projectId, onToggle }: { projectId: number; onToggle: ToggleStatus }) {
  const [expanded, setExpanded] = useState(false);
  const closed = useInfiniteQuery({ ...closedTasksQuery(projectId), enabled: expanded });
  const tasks = closed.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <section aria-label="Closed">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => {
          setExpanded((value) => !value);
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
            <TaskRow key={task.id} task={task} onToggle={onToggle} />
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

/** One Task in the table. Memoized so a change to one row leaves the others alone. */
const TaskRow = memo(function TaskRow({ task, onToggle }: { task: Task; onToggle: ToggleStatus }) {
  const completed = task.status === "completed";
  return (
    <div
      role="row"
      aria-level={1}
      className={cn(
        GRID,
        "flex min-h-11 items-center border-b border-border/60 py-1.5 pr-2 pl-3 transition-colors last:border-b-0 hover:bg-surface-muted/60 lg:min-h-10 lg:py-0",
      )}
    >
      <div role="gridcell" className="flex min-w-0 items-center gap-2.5">
        <TaskCheckbox
          task={task}
          onToggle={() => {
            onToggle(task);
          }}
        />
        <span
          data-task-title
          className={cn(
            "min-w-0 truncate text-sm",
            completed ? "text-muted-foreground line-through" : "font-semibold",
          )}
        >
          {task.title}
        </span>
      </div>
      <div role="gridcell" className="hidden min-w-0 px-2 lg:block">
        <StatusBadge status={task.status} />
      </div>
    </div>
  );
});
