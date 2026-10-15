import { useInfiniteQuery, useQuery, type UseInfiniteQueryResult } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, CircleCheck, Inbox, ListTodo } from "lucide-react";
import { memo, useCallback, useMemo, useState, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { DueBadge } from "./due-badge";
import { QuickAddCard } from "./quick-add-card";
import { DueCell, PriorityCell, StatusCell } from "./task-cells";
import { TaskCheckbox } from "./task-checkbox";
import { TaskDetail } from "./task-detail";
import { PriorityFlag } from "./task-priority";
import { isClosed } from "./task-properties";
import { BlockedNote, StatusBadge } from "./task-status";
import {
  closedTasksQuery,
  openTasksQuery,
  useSetTaskStatus,
  type SidebarProject,
  type Task,
} from "./tasks";

/** One grid for the header and every row, so the columns line up from `lg`. */
const GRID = "lg:grid lg:grid-cols-[minmax(0,1fr)_7.5rem_4.75rem_8.75rem]";

type ToggleStatus = (task: Task) => void;
type OpenTask = (taskId: number) => void;

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
          <span role="columnheader" className="px-2">
            Priority
          </span>
          <span role="columnheader" className="px-2">
            Due
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

/**
 * One Task in the table. A click anywhere on it, or Enter, opens the Task; the checkbox and the
 * cell pickers keep their own action. On phones the cells fold into a meta line under the title.
 * Memoized so a change to one row leaves the others alone.
 */
const TaskRow = memo(function TaskRow({
  task,
  selected,
  onToggle,
  onOpen,
}: {
  task: Task;
  selected: boolean;
  onToggle: ToggleStatus;
  onOpen: OpenTask;
}) {
  const closed = isClosed(task.status);
  const blocked = task.status === "blocked";
  return (
    <div
      role="row"
      tabIndex={0}
      data-task-id={task.id}
      aria-level={1}
      aria-selected={selected}
      onClick={(event) => {
        // Clicks in a picker's menu reach the row through React's tree, not the page's.
        if (event.target instanceof Node && event.currentTarget.contains(event.target)) {
          onOpen(task.id);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" && event.target === event.currentTarget) {
          event.preventDefault();
          onOpen(task.id);
        }
      }}
      className={cn(
        GRID,
        "group/row flex min-h-11 cursor-pointer flex-col justify-center gap-1 border-b border-border/60 py-1.5 pr-2 pl-3 transition-colors outline-none last:border-b-0 lg:min-h-10 lg:items-center lg:gap-0 lg:py-0",
        "focus-visible:bg-primary-soft/50 focus-visible:shadow-[inset_2px_0_0_var(--primary)]",
        selected
          ? "bg-primary-soft/50 shadow-[inset_2px_0_0_var(--primary)]"
          : "hover:bg-surface-muted/60",
      )}
    >
      <div role="gridcell" className="flex min-w-0 items-center gap-2.5">
        <TaskCheckbox
          task={task}
          onToggle={() => {
            onToggle(task);
          }}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <span
            data-task-title
            className={cn(
              "min-w-0 truncate text-sm",
              closed ? "text-muted-foreground line-through" : "font-semibold",
            )}
          >
            {task.title}
          </span>
          {blocked && <BlockedNote task={task} className="hidden lg:flex" />}
        </div>
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 pl-7 empty:hidden lg:hidden">
        {task.status === "wont_do" && <StatusBadge status={task.status} />}
        {blocked && <BlockedNote task={task} className="max-w-full" />}
        <PriorityFlag priority={task.priority} />
        <DueBadge task={task} />
      </div>

      <div role="gridcell" className="hidden min-w-0 lg:block">
        <StatusCell task={task} />
      </div>
      <div role="gridcell" className="hidden min-w-0 lg:block">
        <PriorityCell task={task} />
      </div>
      <div role="gridcell" className="hidden min-w-0 lg:block">
        <DueCell task={task} />
      </div>
    </div>
  );
});
