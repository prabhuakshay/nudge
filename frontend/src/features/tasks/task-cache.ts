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
  Pick<TaskDetail, Editable | "tags" | "countdown" | "repeat_rule" | "repeat_from">
> & { dates?: DatesIn; reminders?: number[]; move_occurrence?: boolean };

/**
 * A Task to move, and where it goes in its Project's tree. A root keeps its Section unless
 * `sectionId` names another one, or null for No section.
 */
export type TaskMove = Placement & { taskId: number; sectionId?: number | null };

/** A Task moved, with its Subtasks, first into another Project as a root with no Section. */
type ProjectChange = { kind: "project"; taskId: number; projectId: number };

/**
 * A change to Tasks, as the cache shows it: fields patched, a Task moved within its Project or to
 * another, a Task removed with its Subtasks, or a Task the server created inserted right after
 * `afterId`, or else first or `last` in its Project.
 */
export type TaskChange =
  | { kind: "patch"; patch: TaskPatch }
  | { kind: "move"; move: TaskMove }
  | ProjectChange
  | { kind: "remove"; taskId: number }
  | { kind: "insert"; task: Task; last?: boolean; afterId?: number };

/**
 * A change as every query shows it. A removal names every Task it removes, since a view can hold
 * a Subtask without the Tasks above it.
 */
type ShownChange =
  Exclude<TaskChange, { kind: "remove" }> | { kind: "remove"; taskIds: Set<number> };

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
    // An undated Task can't repeat or count down, so the server drops both with the dates.
    ...(dates === null && { repeat_rule: "", countdown: false }),
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

/** The ids of the Task and every Subtask under it among the rows. */
function treeIds(rows: Task[], taskId: number): Set<number> {
  const tree = new Set([taskId]);
  // Rows come in sibling order, not tree order, so sweep until no more Subtasks join.
  let size = 0;
  while (size !== tree.size) {
    size = tree.size;
    for (const row of rows) if (row.parent_id !== null && tree.has(row.parent_id)) tree.add(row.id);
  }
  return tree;
}

/** The rows without the Task and every Subtask under it. */
function withoutTree<T extends Task>(rows: T[], taskId: number): T[] {
  const tree = treeIds(rows, taskId);
  return rows.filter((row) => !tree.has(row.id));
}

/** The rows with the Task and its Subtasks in their new Project, the Task as a root there. */
function inProject<T extends Task>(rows: T[], { taskId, projectId }: ProjectChange): T[] {
  const tree = treeIds(rows, taskId);
  const levelsUp = rows.find((row) => row.id === taskId)?.depth ?? 0;
  return rows.map((row) => {
    if (!tree.has(row.id)) return row;
    const moved = { ...row, project_id: projectId, depth: row.depth - levelsUp };
    if (row.id !== taskId) return moved;
    return { ...moved, parent_id: null, section_id: null, parent_title: null };
  });
}

/** The rows with the new Task right after `afterId`, or undefined when that isn't among them. */
function insertedAfter<T extends Task>(rows: T[], task: T, afterId: number | undefined) {
  const index = rows.findIndex((row) => row.id === afterId);
  return index === -1 ? undefined : [...rows.slice(0, index + 1), task, ...rows.slice(index + 1)];
}

/**
 * Rows after a change. `ordered` rows keep a Project's manual order, so a moved Task changes place
 * among them; other rows keep their own order. Inserting is up to each shape.
 */
function rowsAfter<T extends Task>(rows: T[], change: ShownChange, ordered: boolean): T[] {
  switch (change.kind) {
    case "patch":
      return rows.map((row) => patched(row, change.patch));
    case "move": {
      const { move } = change;
      const moved = ordered ? moveRow(rows, move.taskId, move) : rows;
      return moved.map((row) => placed(row, move));
    }
    case "project":
      return inProject(rows, change);
    case "remove":
      return rows.filter((row) => !change.taskIds.has(row.id));
    case "insert":
      return rows;
  }
}

/** An open list after a change: trees whose root closed leave it. */
function openAfter(rows: Task[], change: ShownChange) {
  return openTrees(rowsAfter(rows, change, true));
}

/** A page of Closed Tasks after a change: trees whose root reopened leave it. */
function closedAfter(page: TaskPage, change: ShownChange): TaskPage {
  const rows = rowsAfter(page.items, change, false);
  return { ...page, items: treesWhere(rows, (root) => isClosed(root.status)) };
}

/**
 * A drawer's Task after a change, with its Subtasks. A new Subtask goes right after the one it
 * follows, or last among its parent's; a Subtask moved to another Project leaves the drawer.
 */
function detailAfter(task: TaskDetail, change: ShownChange): TaskDetail {
  if (change.kind === "project") return projectDetailAfter(task, change);
  const [changed = task] = rowsAfter([task], change, false);
  const subtasks = rowsAfter(task.subtasks, change, true);
  if (change.kind !== "insert") return { ...changed, subtasks };
  const isChild = change.task.parent_id === task.id;
  const inserted =
    insertedAfter(subtasks, change.task, change.afterId) ??
    (isChild ? [...subtasks, change.task] : subtasks);
  return { ...changed, subtasks: inserted };
}

/** A drawer's Task after a Task moved to another Project: it, or one of its Subtasks. */
function projectDetailAfter(task: TaskDetail, change: ProjectChange): TaskDetail {
  if (change.taskId !== task.id)
    return { ...task, subtasks: withoutTree(task.subtasks, change.taskId) };
  const [changed = task] = inProject([task], change);
  const [, ...subtasks] = inProject([task, ...task.subtasks], change);
  return { ...changed, ancestors: [], subtasks };
}

/** Whether a dated Task shows on any day of the range. */
function overlaps(task: Task, { start, end }: DayRange) {
  if (task.due_date === null) return false;
  return (task.start_date ?? task.due_date) <= end && task.due_date >= start;
}

/**
 * The Tasks a Calendar range shows after a change. A new Task, or one whose dates changed, shows
 * exactly when its dates overlap the range; `redated` is that Task after the patch, if any cached
 * shape holds it.
 */
function itemsAfter(items: Task[], change: ShownChange, range: DayRange, redated?: Task) {
  const after = rowsAfter(items, change, false);
  if (change.kind === "insert")
    return overlaps(change.task, range) ? [...after, change.task] : after;
  if (!redated) return after;
  if (!overlaps(redated, range)) return after.filter((row) => row.id !== redated.id);
  return after.some((row) => row.id === redated.id) ? after : [...after, redated];
}

/**
 * A Calendar range after a change. It keeps Closed Tasks, so it drops nothing a patch closes, and
 * the Tasks its future Occurrences come from change with the Tasks it shows. A Task that stops
 * repeating, or is removed, loses its future Occurrences.
 */
function calendarAfter(
  data: CalendarRange,
  change: ShownChange,
  range: DayRange,
  redated?: Task,
): CalendarRange {
  const repeating = rowsAfter(data.repeating, change, false);
  const repeats = new Set(repeating.filter((task) => task.repeat_rule).map((task) => task.id));
  return {
    items: itemsAfter(data.items, change, range, redated),
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

/** The Project an open list's key names, if it names one. */
function projectOf(queryKey: QueryKey): number | undefined {
  const source = queryKey[2];
  if (typeof source !== "object" || source === null || !("project" in source)) return undefined;
  return typeof source.project === "number" ? source.project : undefined;
}

/**
 * The Task moved to another Project, with whatever of its Subtasks an open list holds. Its
 * Project's lists hold all of them, so they come first.
 */
function movedTree(lists: [QueryKey, Task[] | undefined][], change: ProjectChange) {
  const holding = lists.filter(([, rows]) => rows?.some((row) => row.id === change.taskId));
  const own = holding.find(([queryKey]) => projectOf(queryKey) !== undefined);
  const rows = (own ?? holding[0])?.[1];
  if (!rows) return undefined;
  const tree = treeIds(rows, change.taskId);
  return inProject(
    rows.filter((row) => tree.has(row.id)),
    change,
  );
}

/**
 * Show a Task moved to another Project in the open lists. It leaves its old Project's lists and
 * goes first in the new Project's; other lists keep it with its new Project. The new Project's
 * Sections show it once they refetch.
 */
function showProjectMove(queryClient: QueryClient, change: ProjectChange) {
  const lists = queryClient.getQueriesData<Task[]>({ queryKey: prefix("open") });
  const moved = movedTree(lists, change);
  for (const [queryKey, rows] of lists) {
    const project = projectOf(queryKey);
    if (!rows || project === change.projectId) continue;
    const after =
      project === undefined ? inProject(rows, change) : withoutTree(rows, change.taskId);
    queryClient.setQueryData(queryKey, after);
  }
  if (!moved) return;
  queryClient.setQueryData<Task[]>(
    taskKeys.open({ project: change.projectId }),
    (rows) => rows && [...moved, ...withoutTree(rows, change.taskId)],
  );
}

/** Show a change in every open list. */
function showInOpenLists(queryClient: QueryClient, change: ShownChange) {
  if (change.kind === "project") {
    showProjectMove(queryClient, change);
    return;
  }
  queryClient.setQueriesData<Task[]>(
    { queryKey: prefix("open") },
    (rows) => rows && openAfter(rows, change),
  );
  if (change.kind !== "insert") return;
  const { task, last = false, afterId } = change;
  // A new root goes where the server put it; a new Subtask goes last among its siblings.
  const atEnd = last || task.parent_id !== null;
  queryClient.setQueryData<Task[]>(
    taskKeys.open({ project: task.project_id }),
    (rows) =>
      rows && (insertedAfter(rows, task, afterId) ?? (atEnd ? [...rows, task] : [task, ...rows])),
  );
}

/** Every Task row the cache holds, in any shape. */
function cachedRows(queryClient: QueryClient): Task[] {
  const lists = queryClient.getQueriesData<Task[]>({ queryKey: prefix("open") });
  const searches = queryClient.getQueriesData<Task[]>({ queryKey: prefix("search") });
  const closed = queryClient.getQueriesData<InfiniteData<TaskPage>>({ queryKey: prefix("closed") });
  const ranges = queryClient.getQueriesData<CalendarRange>({ queryKey: prefix("calendar") });
  const drawers = queryClient.getQueriesData<TaskDetail>({ queryKey: prefix("detail") });
  return [
    ...[...lists, ...searches].flatMap(([, rows]) => rows ?? []),
    ...closed.flatMap(([, data]) => data?.pages.flatMap((page) => page.items) ?? []),
    ...ranges.flatMap(([, data]) => (data ? [...data.items, ...data.repeating] : [])),
    // Last, since a drawer's Task carries fields a row doesn't; they're harmless in a Calendar
    // range until it refetches.
    ...drawers.flatMap(([, task]) => (task ? [...task.subtasks, task] : [])),
  ];
}

/**
 * The Task a patch gives new dates, as it will be after the patch. A patch carries only the
 * changed fields, so the rest comes from a cached shape that holds the Task.
 */
function redatedTask(rows: Task[], change: TaskChange): Task | undefined {
  if (change.kind !== "patch" || change.patch.dates === undefined) return undefined;
  const row = rows.find((task) => task.id === change.patch.id);
  return row && patched(row, change.patch);
}

/** The change as every query shows it, with a removal's Subtasks found across the whole cache. */
function shownChange(rows: Task[], change: TaskChange): ShownChange {
  if (change.kind !== "remove") return change;
  return { kind: "remove", taskIds: treeIds(rows, change.taskId) };
}

/** Show one change in every cached query that holds Tasks. */
function showChange(queryClient: QueryClient, requested: TaskChange) {
  const rows = cachedRows(queryClient);
  const redated = redatedTask(rows, requested);
  const change = shownChange(rows, requested);
  showInOpenLists(queryClient, change);
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
    if (data && range)
      queryClient.setQueryData(queryKey, calendarAfter(data, change, range, redated));
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
