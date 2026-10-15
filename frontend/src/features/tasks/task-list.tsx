import { useInfiniteQuery, useQuery, type UseInfiniteQueryResult } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, CircleCheck, ListTodo } from "lucide-react";
import { useCallback, useMemo, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { ProjectHeader } from "@/features/projects/project-header";
import { ProjectIcon } from "@/features/projects/project-icon";
import { allProjects } from "@/features/projects/projects";
import { groupByProject } from "@/features/tags/group-by-project";
import { TagHeader } from "@/features/tags/tag-header";
import { cn } from "@/lib/utils";

import { QuickAddCard } from "./quick-add-card";
import { TaskDetail } from "./task-detail";
import { GRID, TaskRow, type OpenTask, type ToggleStatus } from "./task-row";
import { isClosed } from "./task-properties";
import {
  closedTasksQuery,
  openTasksQuery,
  sidebarQuery,
  useSetTaskStatus,
  type Sidebar,
  type SidebarProject,
  type SidebarTag,
  type Task,
} from "./tasks";

/** The list to show: one Project's Tasks, or one Tag's Tasks across Projects. */
export type TaskListProps = { project: SidebarProject } | { tag: SidebarTag };

/**
 * What a list shows its Tasks from, and the Project a Task opened from it falls back to. A Tag's
 * list falls back to the Inbox, which is also where its Quick add files new Tasks.
 */
function listSource(props: TaskListProps, sidebar?: Sidebar) {
  if ("project" in props) {
    const { project } = props;
    return { tag: null, project, source: { project: project.id }, label: project.name };
  }
  const { tag } = props;
  return { tag, project: sidebar?.inbox, source: { tag: tag.id }, label: `#${tag.name}` };
}

/** A group of open Tasks under its own heading. */
type Section = { key: string | number; icon: ReactNode; label: string; tasks: Task[] };

/** A Project's open Tasks in one section; a Tag's in one section per Project, in sidebar order. */
function openSections(open: Task[], tag: SidebarTag | null, sidebar?: Sidebar): Section[] {
  if (tag && sidebar && open.length > 0) {
    return groupByProject(open, allProjects(sidebar)).map(({ project, tasks }) => ({
      key: project.id,
      icon: <ProjectIcon project={project} className="size-3.5" />,
      label: project.name,
      tasks,
    }));
  }
  const icon = <ListTodo className="size-3.5 text-muted-foreground" aria-hidden />;
  return [{ key: "tasks", icon, label: "Tasks", tasks: open }];
}

/**
 * A Project's or Tag's Tasks as a table: the page header, Quick add, then the open Tasks and a
 * collapsed Closed group. A Tag's open Tasks are grouped by Project in sidebar order. On phones
 * the table collapses into stacked rows. Clicking a row opens the Task in the drawer.
 */
export function TaskList(props: TaskListProps) {
  const { data: sidebar } = useQuery(sidebarQuery);
  const { tag, project, source, label } = listSource(props, sidebar);
  const { data: open = [] } = useQuery(openTasksQuery(source));
  const sections = openSections(open, tag, sidebar);
  const [showClosed, setShowClosed] = useState(false);
  const closed = useInfiniteQuery({ ...closedTasksQuery(source), enabled: showClosed });
  const closedTasks = useMemo(
    () => (showClosed ? (closed.data?.pages.flatMap((page) => page.items) ?? []) : []),
    [showClosed, closed.data],
  );
  const order = useMemo(
    () => [...sections.flatMap((section) => section.tasks), ...closedTasks].map((task) => task.id),
    [sections, closedTasks],
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
      {"project" in props ? (
        <ProjectHeader project={props.project} />
      ) : (
        <TagHeader tag={props.tag} />
      )}

      {project && <QuickAddCard projectId={project.id} tagId={tag?.id} />}

      <div
        role="treegrid"
        aria-label={`${label} tasks`}
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
          <span role="columnheader" className="hidden px-2 xl:block">
            Tags
          </span>
          <span role="columnheader" className="px-2 text-right">
            Activity
          </span>
        </div>

        {sections.map((section) => (
          <Group
            key={section.key}
            icon={section.icon}
            label={section.label}
            count={section.tasks.length}
          >
            {section.tasks.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                Nothing left here. Add a task above.
              </p>
            ) : (
              section.tasks.map((task) => (
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

      {project && (
        <TaskDetail
          taskId={openId}
          project={project}
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
