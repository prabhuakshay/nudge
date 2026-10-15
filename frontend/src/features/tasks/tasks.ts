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

import { isClosed, STATUS_VERB } from "./task-properties";

export type Task = components["schemas"]["TaskOut"];
export type TaskDetail = components["schemas"]["TaskDetailOut"];
export type TaskStatus = components["schemas"]["Status"];
export type TaskPriority = components["schemas"]["Priority"];
export type TaskActivity = components["schemas"]["TaskActivityListOut"]["items"][number];
export type Attachment = components["schemas"]["AttachmentOut"];
export type DatesChange = components["schemas"]["DatesChangedData"];
export type Sidebar = components["schemas"]["SidebarOut"];
export type SidebarProject = components["schemas"]["SidebarProjectOut"];
export type Tag = components["schemas"]["TagOut"];
export type SidebarTag = components["schemas"]["SidebarTagOut"];

/** Where a list's Tasks come from: one Project, or one Tag across Projects. */
export type TaskSource = { project: number } | { tag: number };

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
const TASKS_KEY = ["tasks"] as const;
/** The key prefix of every open-Task list, so a change can show in all of them at once. */
const OPEN_KEY = [...TASKS_KEY, "open"] as const;

/** A Project's or Tag's open Tasks, in the user's manual order. */
export function openTasksQuery(source: TaskSource) {
  return queryOptions({
    queryKey: [...OPEN_KEY, source],
    queryFn: async (): Promise<Task[]> => {
      const { data } = await api.GET("/api/v1/tasks", { params: { query: source } });
      if (!data) {
        throw new Error("Could not load your tasks.");
      }
      return data.items;
    },
  });
}

/** A Project's or Tag's Closed Tasks, most recently completed first, a page at a time. */
export function closedTasksQuery(source: TaskSource) {
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
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.next_cursor,
  });
}

/** One Task with everything the drawer shows. Keyed under the Task lists so list changes refresh it. */
export function taskQuery(taskId: number) {
  return queryOptions({
    queryKey: [...TASKS_KEY, "detail", taskId],
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
 * replaces all four date fields at once, and `tags` all of its Tags.
 */
export type TaskChange = { id: number } & Partial<
  Pick<TaskDetail, "title" | "description" | "status" | "priority" | "blocked_reason" | "tags">
> & { dates?: DatesIn };

const UNDATED = { due_date: null, due_time: null, start_date: null, start_time: null };

async function patchTask({ id, tags, ...change }: TaskChange) {
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
function withChange<T extends Task>(task: T, { dates, ...change }: TaskChange): T {
  const leavesStatus = change.status !== undefined && change.status !== task.status;
  // The server drops the Blocked reason on any Status change, unless the change sets one.
  return {
    ...task,
    ...(leavesStatus && { blocked_reason: "" }),
    ...change,
    ...(dates !== undefined && { ...UNDATED, ...dates }),
  };
}

/** Show a change in the drawer and in every open list before the server answers. */
async function showChange(queryClient: QueryClient, change: TaskChange) {
  const detailKey = taskQuery(change.id).queryKey;
  await queryClient.cancelQueries({ queryKey: detailKey });
  await queryClient.cancelQueries({ queryKey: OPEN_KEY });
  queryClient.setQueryData(detailKey, (task) => task && withChange(task, change));
  queryClient.setQueriesData<Task[]>({ queryKey: OPEN_KEY }, (tasks) =>
    tasks?.flatMap((task) => {
      if (task.id !== change.id) return [task];
      const changed = withChange(task, change);
      return isClosed(changed.status) ? [] : [changed];
    }),
  );
}

/** Refetch everything a Task change can touch: the lists, the drawer, Activity and counts. */
function refresh(queryClient: QueryClient) {
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
    onSettled: () => refresh(queryClient),
  });
}

/**
 * Set a Task's Status, then offer Undo in a toast. Undo gives every Task the change touched back
 * the Status and Blocked reason it had, as the server reported them.
 */
export function useSetTaskStatus() {
  const queryClient = useQueryClient();
  const { mutate: update } = useUpdateTask();
  return useMutation({
    mutationFn: ({ task, status }: { task: Task; status: TaskStatus }) =>
      patchTask({ id: task.id, status }),
    onMutate: ({ task, status }) => showChange(queryClient, { id: task.id, status }),
    onSuccess: ({ affected }, { task, status }) => {
      toast(`${STATUS_VERB[status]} “${task.title}”`, {
        action: {
          label: "Undo",
          onClick: () => {
            for (const prior of affected) {
              update({
                id: prior.id,
                status: prior.prior_status,
                ...(prior.prior_status === "blocked" && {
                  blocked_reason: prior.prior_blocked_reason,
                }),
              });
            }
          },
        },
      });
    },
    onError: (error) => toast.error(error.message),
    onSettled: () => refresh(queryClient),
  });
}

/**
 * Add a Task from Quick add, with the given Tag if any. It appears first in its Project, as the
 * server places it, and first in the Tag's list.
 */
export function useCreateTask(projectId: number, tagId?: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (title: string) => {
      const { data } = await api.POST("/api/v1/tasks", {
        body: { title, project_id: projectId, ...(tagId !== undefined && { tag_ids: [tagId] }) },
      });
      if (!data) {
        throw new Error("Could not add the task.");
      }
      return data;
    },
    onSuccess: (task) => {
      const sources: TaskSource[] = [{ project: projectId }];
      if (tagId !== undefined) sources.push({ tag: tagId });
      for (const source of sources) {
        queryClient.setQueryData(openTasksQuery(source).queryKey, (tasks) =>
          tasks ? [task, ...tasks] : [task],
        );
      }
    },
    onError: (error) => toast.error(error.message),
    onSettled: () => queryClient.invalidateQueries(sidebarQuery),
  });
}

/** Move a Task to another Project, where it goes first. Both lists and the sidebar refresh. */
export function useMoveTaskToProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, projectId }: { id: number; projectId: number }) => {
      const { data } = await api.PATCH("/api/v1/tasks/{task_id}", {
        params: { path: { task_id: id } },
        body: { project_id: projectId },
      });
      if (!data) {
        throw new Error("Could not move the task.");
      }
      return data;
    },
    onError: (error) => toast.error(error.message),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: TASKS_KEY }),
        queryClient.invalidateQueries(sidebarQuery),
      ]),
  });
}
