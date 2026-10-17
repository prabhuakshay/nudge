/*
 * The cache of everything that holds Tasks: the query keys, and how a change to a Task shows in
 * every cached list, drawer, Calendar range and search before the server answers.
 */

import type { InfiniteData, QueryClient, QueryKey } from "@tanstack/react-query";

import type { components } from "@/api/schema";
import { useCacheMutation, type CacheMutation } from "@/lib/cache-mutation";

import { remindersAfter } from "./reminders";
import { moveRow, type Placement } from "./task-drag";
import { openTrees, treesWhere } from "./task-tree";
import { isClosed } from "./task-properties";
import type { DatesIn, ListSource, Task, TaskDetail } from "./tasks";

type CalendarRange = components["schemas"]["CalendarOut"];
type TaskPage = components["schemas"]["TaskListOut"];

/** Calendar ranges are keyed by their first and last days, both included. */
export type DayRange = { start: string; end: string };

const ALL = ["tasks"] as const;

/**
 * The query keys of everything that holds Tasks. They all start with `all`, so one invalidation
 * refreshes them; the sidebar's open counts sit apart, so a refetch names it too.
 */
export const taskKeys = {
  all: ALL,
  sidebar: ["sidebar"] as const,
  open: (source: ListSource) => [...ALL, "open", source] as const,
  closed: (source: ListSource) => [...ALL, "closed", source] as const,
  detail: (taskId: number) => [...ALL, "detail", taskId] as const,
  calendar: (range: DayRange) => [...ALL, "calendar", range] as const,
  search: (query: string) => [...ALL, "search", query] as const,
  activity: (taskId: number) => [...ALL, "activity", taskId] as const,
  attachments: (taskId: number) => [...ALL, "attachments", taskId] as const,
  comments: (taskId: number) => [...ALL, "comments", taskId] as const,
};

/** What every Task change refetches once it settles: every Task query and the sidebar's counts. */
export const TASK_REFETCH = [taskKeys.all, taskKeys.sidebar] as const;

/** The prefix every key of one kind shares, such as every open list's. */
const prefix = (name: "open" | "closed" | "detail" | "calendar" | "search") => [...ALL, name];

type Editable = "title" | "description" | "status" | "priority" | "blocked_reason";

/**
 * A PATCH to a Task: the fields to set, which are all left as they are when absent. `dates`
 * replaces all four date fields at once, and removing them removes the Reminders. `reminders`
 * replaces the Reminders, as offsets in minutes, and `tags` all of its Tags.
 */
export type TaskPatch = { id: number; pinned?: boolean } & Partial<
  Pick<TaskDetail, Editable | "tags" | "repeat_rule" | "repeat_from">
> & { dates?: DatesIn; reminders?: number[]; move_occurrence?: boolean };

/**
 * A Task to move, and where it goes in its Project's tree. A root keeps its Section unless
 * `sectionId` names another one, or null for No section.
 */
export type TaskMove = Placement & { taskId: number; sectionId?: number | null };

/**
 * A change to Tasks, as the cache shows it: fields patched, a Task moved, a Task removed with its
 * Subtasks, or a Task the server created inserted first or `last` in its Project.
 */
export type TaskChange =
  | { kind: "patch"; patch: TaskPatch }
  | { kind: "move"; move: TaskMove }
  | { kind: "remove"; taskId: number }
  | { kind: "insert"; task: Task; last?: boolean };

const UNDATED = { due_date: null, due_time: null, start_date: null, start_time: null };

/** The Task as the server will return it after the patch, for showing it straight away. */
function patched<T extends Task>(task: T, patch: TaskPatch): T {
  if (task.id !== patch.id) return task;
  const { pinned, dates, reminders, ...fields } = patch;
  const leavesStatus = fields.status !== undefined && fields.status !== task.status;
  return {
    ...task,
    // The server drops the Blocked reason on any Status change, unless the change sets one.
    ...(leavesStatus && { blocked_reason: "" }),
    pinned_at: pinnedAt(task, pinned),
    ...fields,
    ...(dates !== undefined && { ...UNDATED, ...dates }),
    // An undated Task can't repeat, so the server drops the Repeat with the dates.
    ...(dates === null && { repeat_rule: "" }),
    // Only the drawer's Task carries its Reminders; list rows don't.
    ...("reminders" in task && remindersAfter(reminders, dates)),
  };
}

function pinnedAt(task: Task, pinned: boolean | undefined) {
  if (pinned === undefined || pinned === (task.pinned_at !== null)) return task.pinned_at;
  // The server sets the real time; now is close enough to show the Task in the right group.
  return pinned ? new Date().toISOString() : null;
}

/** The Task in its new place if it's the one moved; a Subtask can't stay Pinned. */
function placed<T extends Task>(task: T, { taskId, parentId, sectionId }: TaskMove): T {
  if (task.id !== taskId) return task;
  return {
    ...task,
    parent_id: parentId,
    pinned_at: parentId === null ? task.pinned_at : null,
    ...(sectionId !== undefined && { section_id: sectionId }),
  };
}

/** The rows without the Task and every Subtask under it. */
function withoutTree<T extends Task>(rows: T[], taskId: number): T[] {
  const gone = new Set([taskId]);
  // Rows come in sibling order, not tree order, so sweep until no more Subtasks join.
  let size = 0;
  while (size !== gone.size) {
    size = gone.size;
    for (const row of rows) if (row.parent_id !== null && gone.has(row.parent_id)) gone.add(row.id);
  }
  return rows.filter((row) => !gone.has(row.id));
}

/**
 * Rows after a change. `ordered` rows keep a Project's manual order, so a moved Task changes place
 * among them; other rows keep their own order. Inserting is up to each shape.
 */
function rowsAfter<T extends Task>(rows: T[], change: TaskChange, ordered: boolean): T[] {
  switch (change.kind) {
    case "patch":
      return rows.map((row) => patched(row, change.patch));
    case "move": {
      const { move } = change;
      const moved = ordered ? moveRow(rows, move.taskId, move) : rows;
      return moved.map((row) => placed(row, move));
    }
    case "remove":
      return withoutTree(rows, change.taskId);
    case "insert":
      return rows;
  }
}

/** An open list after a change: trees whose root closed leave it. */
function openAfter(rows: Task[], change: TaskChange) {
  return openTrees(rowsAfter(rows, change, true));
}

/** A page of Closed Tasks after a change: trees whose root reopened leave it. */
function closedAfter(page: TaskPage, change: TaskChange): TaskPage {
  const rows = rowsAfter(page.items, change, false);
  return { ...page, items: treesWhere(rows, (root) => isClosed(root.status)) };
}

/** A drawer's Task after a change, with its Subtasks; a new Subtask of it goes last. */
function detailAfter(task: TaskDetail, change: TaskChange): TaskDetail {
  const [changed = task] = rowsAfter([task], change, false);
  const subtasks = rowsAfter(task.subtasks, change, true);
  const isChild = change.kind === "insert" && change.task.parent_id === task.id;
  return { ...changed, subtasks: isChild ? [...subtasks, change.task] : subtasks };
}

/** Whether a dated Task shows on any day of the range. */
function overlaps(task: Task, { start, end }: DayRange) {
  if (task.due_date === null) return false;
  return (task.start_date ?? task.due_date) <= end && task.due_date >= start;
}

/**
 * A Calendar range after a change. It keeps Closed Tasks, so it drops nothing a patch closes, and
 * the Tasks its future Occurrences come from change with the Tasks it shows. A Task that stops
 * repeating, or is removed, loses its future Occurrences.
 */
function calendarAfter(data: CalendarRange, change: TaskChange, range: DayRange): CalendarRange {
  const items = rowsAfter(data.items, change, false);
  const shows = change.kind === "insert" && overlaps(change.task, range);
  const repeating = rowsAfter(data.repeating, change, false);
  const repeats = new Set(repeating.filter((task) => task.repeat_rule).map((task) => task.id));
  return {
    items: shows ? [...items, change.task] : items,
    occurrences: data.occurrences.filter((occurrence) => repeats.has(occurrence.task_id)),
    repeating,
  };
}

/** The range a Calendar key names. */
function rangeOf(queryKey: QueryKey): DayRange | undefined {
  const range = queryKey[2];
  if (typeof range !== "object" || range === null) return undefined;
  if (!("start" in range) || !("end" in range)) return undefined;
  const { start, end } = range;
  return typeof start === "string" && typeof end === "string" ? { start, end } : undefined;
}

/** Show one change in every cached query that holds Tasks. */
function showChange(queryClient: QueryClient, change: TaskChange) {
  queryClient.setQueriesData<Task[]>(
    { queryKey: prefix("open") },
    (rows) => rows && openAfter(rows, change),
  );
  if (change.kind === "insert") {
    const { task, last = false } = change;
    // A new root goes where the server put it; a new Subtask goes last among its siblings.
    const atEnd = last || task.parent_id !== null;
    queryClient.setQueryData<Task[]>(
      taskKeys.open({ project: task.project_id }),
      (rows) => rows && (atEnd ? [...rows, task] : [task, ...rows]),
    );
  }
  queryClient.setQueriesData<InfiniteData<TaskPage>>(
    { queryKey: prefix("closed") },
    (data) => data && { ...data, pages: data.pages.map((page) => closedAfter(page, change)) },
  );
  queryClient.setQueriesData<TaskDetail>(
    { queryKey: prefix("detail") },
    (task) => task && detailAfter(task, change),
  );
  for (const [queryKey, data] of queryClient.getQueriesData<CalendarRange>({
    queryKey: prefix("calendar"),
  })) {
    const range = rangeOf(queryKey);
    if (data && range) queryClient.setQueryData(queryKey, calendarAfter(data, change, range));
  }
  queryClient.setQueriesData<Task[]>(
    { queryKey: prefix("search") },
    (rows) => rows && rowsAfter(rows, change, false),
  );
}

/** Show changes to Tasks in every cached query that holds Tasks, in order. */
export function showTaskChanges(queryClient: QueryClient, changes: TaskChange[]) {
  for (const change of changes) showChange(queryClient, change);
}

/** A request that changes Tasks, and the changes it makes. */
type TaskMutation<V, R> = Pick<CacheMutation<V, R>, "mutationFn"> & {
  /** The changes to show before the server answers. */
  changes?: (variables: V) => TaskChange[];
  /** The changes to show once the server answers, such as a Task it created. */
  answered?: (result: R, variables: V) => TaskChange[];
  onSuccess?: (result: R, variables: V) => void;
  /** Queries to refetch besides the Tasks and the sidebar, such as the Trash. */
  alsoRefetch?: readonly QueryKey[];
};

/**
 * A mutation of Tasks. Its changes show in every list, drawer, Calendar range and search at once;
 * a failed request puts them all back and toasts the reason, and every Task refetches once the
 * request settles.
 */
export function useTaskMutation<V, R>({
  mutationFn,
  changes,
  answered,
  onSuccess,
  alsoRefetch = [],
}: TaskMutation<V, R>) {
  return useCacheMutation({
    mutationFn,
    ...(changes && {
      optimistic: {
        touches: taskKeys.all,
        show: (queryClient: QueryClient, variables: V) => {
          showTaskChanges(queryClient, changes(variables));
        },
      },
    }),
    onSuccess: (result, variables, queryClient) => {
      if (answered) showTaskChanges(queryClient, answered(result, variables));
      onSuccess?.(result, variables);
    },
    refetch: [...TASK_REFETCH, ...alsoRefetch],
  });
}
