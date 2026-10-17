import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";

import { api } from "@/api/client";
import { failureReason } from "@/api/errors";
import type { components } from "@/api/schema";
import { editing, useCacheMutation } from "@/lib/cache-mutation";

import type { ScheduleView } from "./schedule";
import { taskKeys, useTaskMutation, type TaskPatch } from "./task-cache";

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
  queryKey: taskKeys.sidebar,
  queryFn: async (): Promise<Sidebar> => {
    const { data } = await api.GET("/api/v1/sidebar");
    if (!data) {
      throw new Error("Could not load the sidebar.");
    }
    return data;
  },
});

/** A Project's open Tasks with every Subtask under them, as flat rows in manual order. */
export function openTasksQuery(projectId: number) {
  return queryOptions({
    queryKey: taskKeys.open({ project: projectId }),
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

/**
 * Where a list's Tasks come from: a Project, optionally one of its Sections or No section ("none"),
 * a Tag or Person, or a view that picks them by date.
 */
export type ListSource =
  | { project: number; section?: number | "none" }
  | { tag: number }
  | { person: number }
  | { view: ScheduleView };

/**
 * A view's open Tasks as flat rows, in the order the view lists them: Today has Overdue first,
 * Upcoming goes day by day, All goes day by day with undated Tasks last.
 */
export function viewTasksQuery(view: ScheduleView) {
  return queryOptions({
    queryKey: taskKeys.open({ view }),
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

/** The Closed Tasks of one of a Project's Sections, or of No section for null, as above. */
export function sectionClosedQuery(projectId: number, sectionId: number | null) {
  return closedPagesQuery({ project: projectId, section: sectionId ?? "none" });
}

/** The Tasks in Today that were closed today, most recently closed first, a page at a time. */
export const closedTodayQuery = closedPagesQuery({ view: "today" });

/** A list's Closed Tasks, most recently completed first, a page at a time. */
export function closedPagesQuery(source: ListSource) {
  return infiniteQueryOptions({
    queryKey: taskKeys.closed(source),
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
    queryKey: taskKeys.detail(taskId),
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
    queryKey: taskKeys.activity(taskId),
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
    queryKey: taskKeys.attachments(taskId),
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
  return useCacheMutation({
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
        throw new Error(failureReason(error, "Could not upload the file."));
      }
      return data;
    },
    refetch: [taskKeys.all],
  });
}

/** Delete an Attachment for good. It leaves the drawer before the server answers. */
export function useDeleteAttachment(taskId: number) {
  return useCacheMutation({
    mutationFn: async (attachmentId: number) => {
      const { response } = await api.DELETE("/api/v1/attachments/{attachment_id}", {
        params: { path: { attachment_id: attachmentId } },
      });
      if (!response.ok) {
        throw new Error("Could not delete the attachment.");
      }
    },
    optimistic: editing(attachmentsQuery(taskId).queryKey, (items, attachmentId: number) =>
      items.filter((item) => item.id !== attachmentId),
    ),
    refetch: [taskKeys.all],
  });
}

/** A Task's dates as the API takes them; null removes them all. */
export type DatesIn = components["schemas"]["TaskDatesIn"] | null;

export async function patchTask({ id, tags, ...change }: TaskPatch) {
  const { data, error } = await api.PATCH("/api/v1/tasks/{task_id}", {
    params: { path: { task_id: id } },
    body: { ...change, ...(tags && { tag_ids: tags.map((tag) => tag.id) }) },
  });
  if (!data) {
    throw new Error(failureReason(error, "Could not save the task."));
  }
  return data;
}

/** Change a Task's fields. The drawer and the lists show the change before the server answers. */
export function useUpdateTask() {
  return useTaskMutation({
    mutationFn: patchTask,
    changes: (patch) => [{ kind: "patch", patch }],
  });
}

/** A new Task as the API takes it. */
export type NewTask = components["schemas"]["TaskIn"];

/**
 * Add a Task from Quick add. Once the server answers it appears first in its Project's list, or
 * last when asked, and on the Calendar; the views its dates, Tags and Mentions put it in refetch.
 */
export function useCreateTask() {
  return useTaskMutation({
    mutationFn: async (task: NewTask) => {
      const { data, error } = await api.POST("/api/v1/tasks", { body: task });
      if (!data) {
        throw new Error(failureReason(error, "Could not add the task."));
      }
      return data;
    },
    answered: (task, { last }) => [{ kind: "insert", task, last: last ?? false }],
  });
}
