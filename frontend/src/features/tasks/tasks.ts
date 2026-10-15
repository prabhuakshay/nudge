import {
  infiniteQueryOptions,
  queryOptions,
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";

import { api } from "@/api/client";
import type { components } from "@/api/schema";

import { remindersAfter } from "./reminders";
import type { ScheduleView } from "./schedule";
import { openTrees } from "./task-tree";

export type Task = components["schemas"]["TaskOut"];
export type TaskDetail = components["schemas"]["TaskDetailOut"];
export type TaskStatus = components["schemas"]["Status"];
export type TaskPriority = components["schemas"]["Priority"];
export type TaskActivity = components["schemas"]["TaskActivityListOut"]["items"][number];
export type Attachment = components["schemas"]["AttachmentOut"];
export type DatesChange = components["schemas"]["DatesChangedData"];
export type RemindersChange = components["schemas"]["RemindersChangedData"];
export type RepeatChange = components["schemas"]["RepeatChangedData"];
export type Sidebar = components["schemas"]["SidebarOut"];
export type SidebarProject = components["schemas"]["SidebarProjectOut"];

/** The sidebar: the Inbox, Folders and Projects with open counts. Task changes invalidate it. */
export const sidebarQuery = queryOptions({
  queryKey: ["sidebar"],
  queryFn: async (): Promise<Sidebar> => {
    const { data } = await api.GET("/api/v1/sidebar");
    if (!data) {
      throw new Error("Could not load the sidebar.");
    }
    return data;
  },
});

/** The key prefix of every Task list, so one invalidation refreshes them all. */
export const TASKS_KEY = ["tasks"] as const;
/** The key prefix of every open-Task list, so a change can show in all of them at once. */
export const OPEN_KEY = [...TASKS_KEY, "open"] as const;
/** The key prefix of every drawer's Task, so a change can show in a parent's Subtasks too. */
export const DETAIL_KEY = [...TASKS_KEY, "detail"] as const;

/** A Project's open Tasks with every Subtask under them, as flat rows in manual order. */
export function openTasksQuery(projectId: number) {
  return queryOptions({
    queryKey: [...OPEN_KEY, projectId],
    queryFn: async (): Promise<Task[]> => {
      const { data } = await api.GET("/api/v1/tasks", {
        params: { query: { project: projectId } },
      });
      if (!data) {
        throw new Error("Could not load your tasks.");
      }
      return data.items;
    },
  });
}

/** Where a list's Tasks come from: a Project, Tag or Person, or a view that picks them by date. */
export type ListSource =
  { project: number } | { tag: number } | { person: number } | { view: ScheduleView };

/**
 * A view's open Tasks as flat rows, in the order the view lists them: Today has Overdue first,
 * Upcoming goes day by day.
 */
export function viewTasksQuery(view: ScheduleView) {
  return queryOptions({
    queryKey: [...OPEN_KEY, view],
    queryFn: async (): Promise<Task[]> => {
      const { data } = await api.GET("/api/v1/tasks", { params: { query: { view } } });
      if (!data) {
        throw new Error("Could not load your tasks.");
      }
      return data.items;
    },
  });
}

/** A Project's Closed Tasks with their Subtasks, most recently completed first, a page at a time. */
export function closedTasksQuery(projectId: number) {
  return closedPagesQuery({ project: projectId });
}

/** The Tasks in Today that were closed today, most recently closed first, a page at a time. */
export const closedTodayQuery = closedPagesQuery({ view: "today" });

/** A list's Closed Tasks, most recently completed first, a page at a time. */
export function closedPagesQuery(source: ListSource) {
  return infiniteQueryOptions({
    queryKey: [...TASKS_KEY, "closed", source],
    queryFn: async ({ pageParam }) => {
      const { data } = await api.GET("/api/v1/tasks", {
        params: { query: { ...source, closed: true, ...(pageParam && { cursor: pageParam }) } },
      });
      if (!data) {
        throw new Error("Could not load your closed tasks.");
      }
      return data;
    },
    // Widened so later pages' cursors, which are strings, fit the same parameter.
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.next_cursor,
  });
}

/** One Task with everything the drawer shows. Keyed under the Task lists so list changes refresh it. */
export function taskQuery(taskId: number) {
  return queryOptions({
    queryKey: [...DETAIL_KEY, taskId],
    queryFn: async (): Promise<TaskDetail> => {
      const { data } = await api.GET("/api/v1/tasks/{task_id}", {
        params: { path: { task_id: taskId } },
      });
      if (!data) {
        throw new Error("Could not load the task.");
      }
      return data;
    },
  });
}

/** A Task's history, newest first, a page at a time. Task changes add to it, so it shares their key. */
export function taskActivityQuery(taskId: number) {
  return infiniteQueryOptions({
    queryKey: [...TASKS_KEY, "activity", taskId],
    queryFn: async ({ pageParam }) => {
      const { data } = await api.GET("/api/v1/tasks/{task_id}/activity", {
        params: { path: { task_id: taskId }, query: { ...(pageParam && { cursor: pageParam }) } },
      });
      if (!data) {
        throw new Error("Could not load the task's activity.");
      }
      return data;
    },
    // Widened so later pages' cursors, which are strings, fit the same parameter.
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.next_cursor,
  });
}

/** A Task's Attachments, oldest first. Uploads and deletes add Activity, so it shares their key. */
export function attachmentsQuery(taskId: number) {
  return queryOptions({
    queryKey: [...TASKS_KEY, "attachments", taskId],
    queryFn: async (): Promise<Attachment[]> => {
      const { data } = await api.GET("/api/v1/tasks/{task_id}/attachments", {
        params: { path: { task_id: taskId } },
      });
      if (!data) {
        throw new Error("Could not load the attachments.");
      }
      return data;
    },
  });
}

/** Where the browser fetches an Attachment's bytes: inline for images and PDFs, else a download. */
export function attachmentUrl(attachmentId: number) {
  return `/api/v1/attachments/${String(attachmentId)}/download`;
}

/** Upload one file to a Task. Several files go up one request each. */
export function useUploadAttachment(taskId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const { data, error } = await api.POST("/api/v1/tasks/{task_id}/attachments", {
        params: { path: { task_id: taskId } },
        // The schema types a file as a string (OpenAPI's binary format); the File goes as is.
        body: { file: file as unknown as string },
        bodySerializer: (body) => {
          const form = new FormData();
          form.append("file", body.file);
          return form;
        },
      });
      if (error) {
        // The server explains a refusal, such as a file over the size limit.
        throw new Error(error.detail);
      }
      return data;
    },
    onError: (error) => toast.error(error.message),
    onSettled: () => queryClient.invalidateQueries({ queryKey: TASKS_KEY }),
  });
}

/** Delete an Attachment for good. It leaves the drawer before the server answers. */
export function useDeleteAttachment(taskId: number) {
  const queryClient = useQueryClient();
  const key = attachmentsQuery(taskId).queryKey;
  return useMutation({
    mutationFn: async (attachmentId: number) => {
      const { response } = await api.DELETE("/api/v1/attachments/{attachment_id}", {
        params: { path: { attachment_id: attachmentId } },
      });
      if (!response.ok) {
        throw new Error("Could not delete the attachment.");
      }
    },
    onMutate: async (attachmentId) => {
      await queryClient.cancelQueries({ queryKey: key });
      queryClient.setQueryData(key, (items) => items?.filter((item) => item.id !== attachmentId));
    },
    onError: (error) => toast.error(error.message),
    onSettled: () => queryClient.invalidateQueries({ queryKey: TASKS_KEY }),
  });
}

/** A Task's dates as the API takes them; null removes them all. */
export type DatesIn = components["schemas"]["TaskDatesIn"] | null;

/**
 * A change to a Task: the fields to set, which are all left as they are when absent. `dates`
 * replaces all four date fields at once, and removing them removes the Reminders. `reminders`
 * replaces the Reminders, as offsets in minutes, and `tags` all of its Tags.
 */
type Editable = "title" | "description" | "status" | "priority" | "blocked_reason";
export type TaskChange = { id: number; pinned?: boolean } & Partial<
  Pick<TaskDetail, Editable | "tags" | "repeat_rule" | "repeat_from">
> & { dates?: DatesIn; reminders?: number[] };

const UNDATED = { due_date: null, due_time: null, start_date: null, start_time: null };

export async function patchTask({ id, tags, ...change }: TaskChange) {
  const { data } = await api.PATCH("/api/v1/tasks/{task_id}", {
    params: { path: { task_id: id } },
    body: { ...change, ...(tags && { tag_ids: tags.map((tag) => tag.id) }) },
  });
  if (!data) {
    throw new Error("Could not save the task.");
  }
  return data;
}

/** The Task as the server will return it after the change, for showing the change straight away. */
function withChange<T extends Task>(
  task: T,
  { pinned, dates, reminders, ...change }: TaskChange,
): T {
  const leavesStatus = change.status !== undefined && change.status !== task.status;
  return {
    ...task,
    // The server drops the Blocked reason on any Status change, unless the change sets one.
    ...(leavesStatus && { blocked_reason: "" }),
    pinned_at: pinnedAt(task, pinned),
    ...change,
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

/** The Task with the change applied if it's the one changed, else the Task as it is. */
function applyTo<T extends Task>(task: T, change: TaskChange): T {
  return task.id === change.id ? withChange(task, change) : task;
}

/** Show a change in every drawer and list before the server answers, dropping closed trees. */
export async function showChange(queryClient: QueryClient, change: TaskChange) {
  await queryClient.cancelQueries({ queryKey: DETAIL_KEY });
  await queryClient.cancelQueries({ queryKey: OPEN_KEY });
  queryClient.setQueriesData<TaskDetail>(
    { queryKey: DETAIL_KEY },
    (task) =>
      task && {
        ...applyTo(task, change),
        subtasks: task.subtasks.map((subtask) => applyTo(subtask, change)),
      },
  );
  queryClient.setQueriesData<Task[]>(
    { queryKey: OPEN_KEY },
    (tasks) => tasks && openTrees(tasks.map((task) => applyTo(task, change))),
  );
}

/** Refetch everything a Task change can touch: the lists, the drawer, Activity and counts. */
export function refreshTasks(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: TASKS_KEY }),
    queryClient.invalidateQueries(sidebarQuery),
  ]);
}

/** Change a Task's fields. The drawer and the lists show the change before the server answers. */
export function useUpdateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: patchTask,
    onMutate: (change) => showChange(queryClient, change),
    onError: (error) => toast.error(error.message),
    onSettled: () => refreshTasks(queryClient),
  });
}

/** A new Task as the API takes it. */
export type NewTask = components["schemas"]["TaskIn"];

/**
 * Add a Task from Quick add. It appears first in its Project's list, as the server places it, and
 * wherever its dates, Tags and Mentions put it.
 */
export function useCreateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (task: NewTask) => {
      const { data } = await api.POST("/api/v1/tasks", { body: task });
      if (!data) {
        throw new Error("Could not add the task.");
      }
      return data;
    },
    onSuccess: (task) => {
      queryClient.setQueryData(
        openTasksQuery(task.project_id).queryKey,
        (tasks) => tasks && [task, ...tasks],
      );
    },
    onError: (error) => toast.error(error.message),
    onSettled: () =>
      Promise.all([
        ...["today", "upcoming", "tag", "person"].map((list) =>
          queryClient.invalidateQueries({ queryKey: [...OPEN_KEY, list] }),
        ),
        queryClient.invalidateQueries(sidebarQuery),
      ]),
  });
}
