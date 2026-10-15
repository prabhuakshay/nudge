import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ListTodo } from "lucide-react";
import { Fragment, useCallback, useMemo, useState } from "react";

import { Kbd } from "@/components/ui/kbd";
import { ArchivedNotice } from "@/features/projects/archived-notice";
import { ProjectHeader } from "@/features/projects/project-header";
import { SHORTCUTS, keyCaps, type ShortcutId } from "@/features/shortcuts/registry";
import { useMediaQuery } from "@/lib/use-media-query";

import { ExpandCollapse } from "./expand-collapse";
import { useOpenTask } from "./open-task";
import { QuickAddCard } from "./quick-add-card";
import { SelectionBar } from "./selection-bar";
import { TaskDetail } from "./task-detail";
import { useRowContext } from "./row-context";
import type { Placement } from "./task-drag";
import { useMoveTask } from "./task-placement";
import type { ToggleCollapsed } from "./task-row";
import { ClosedGroup, Group, PinnedGroup, TaskTableHeader } from "./task-groups";
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
  const closed = useInfiniteQuery({
    ...closedTasksQuery(project.id),
    enabled: showClosed,
  });
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
        <QuickAddCard view={{ kind: "project", project }} />
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
            <PinnedGroup count={rootCount(pinned)}>
              <SortableTaskRows tasks={pinned} context={context} />
            </PinnedGroup>
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
        <p className="mt-3 hidden flex-wrap items-center gap-3 text-[11px] text-muted-foreground lg:flex">
          <KeyHint shortcut="openTask">open</KeyHint>
          <KeyHint shortcut="completeTask">complete</KeyHint>
          <KeyHint shortcut="indent">nest</KeyHint>
          <KeyHint shortcut="moveUp">reorder</KeyHint>
          <KeyHint shortcut="showShortcuts">all shortcuts</KeyHint>
          <span>Drag a row sideways to change nesting</span>
        </p>
      )}

      <SelectionBar tasks={[...open, ...closedTasks]} context={rowContext} />

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

/** One key in the list's footer, spelled from the shortcut registry, then what it does. */
function KeyHint({ shortcut, children }: { shortcut: ShortcutId; children: string }) {
  const [binding = ""] = SHORTCUTS[shortcut].keys;
  return (
    <span>
      {keyCaps(binding)
        .flat()
        .map((cap, index) => (
          <Fragment key={cap}>
            {index > 0 && "+"}
            <Kbd>{cap}</Kbd>
          </Fragment>
        ))}{" "}
      {children}
    </span>
  );
}

function rootCount(tasks: Task[]) {
  return tasks.filter((task) => task.parent_id === null).length;
}
