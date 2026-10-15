import {
  infiniteQueryOptions,
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";

import { api } from "@/api/client";
import type { components } from "@/api/schema";

export type Task = components["schemas"]["TaskOut"];
export type TaskDetail = components["schemas"]["TaskDetailOut"];
export type TaskStatus = components["schemas"]["Status"];
export type TaskActivity = components["schemas"]["TaskActivityListOut"]["items"][number];
export type DatesChange = components["schemas"]["DatesChangedData"];
export type Sidebar = components["schemas"]["SidebarOut"];
export type SidebarProject = components["schemas"]["SidebarProjectOut"];

/** The sidebar: the Inbox and its open count. Every Task change invalidates it. */
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

/** A Project's open Tasks, in the user's manual order. */
export function openTasksQuery(projectId: number) {
  return queryOptions({
    queryKey: [...TASKS_KEY, projectId, "open"],
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

/** A Project's Closed Tasks, most recently completed first, a page at a time. */
export function closedTasksQuery(projectId: number) {
  return infiniteQueryOptions({
    queryKey: [...TASKS_KEY, projectId, "closed"],
    queryFn: async ({ pageParam }) => {
      const { data } = await api.GET("/api/v1/tasks", {
        params: {
          query: { project: projectId, closed: true, ...(pageParam && { cursor: pageParam }) },
        },
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

/** A Task's dates as the API takes them; null removes them all. */
export type DatesIn = components["schemas"]["TaskDatesIn"] | null;

/** The fields the drawer and the list's cells edit in place. */
export type TaskChange = { id: number } & Partial<Pick<TaskDetail, "title" | "description">> & {
    dates?: DatesIn;
  };

const UNDATED = { due_date: null, due_time: null, start_date: null, start_time: null };

/** Save a Task's title, Description or dates. The drawer shows the change before the server answers. */
export function useUpdateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...change }: TaskChange) => {
      const { data } = await api.PATCH("/api/v1/tasks/{task_id}", {
        params: { path: { task_id: id } },
        body: change,
      });
      if (!data) {
        throw new Error("Could not save the task.");
      }
      return data;
    },
    onMutate: async ({ id, dates, ...change }) => {
      const detailKey = taskQuery(id).queryKey;
      await queryClient.cancelQueries({ queryKey: detailKey });
      const flatDates = dates === undefined ? {} : { ...UNDATED, ...dates };
      queryClient.setQueryData(detailKey, (task) => task && { ...task, ...change, ...flatDates });
    },
    onError: (error) => toast.error(error.message),
    onSettled: () => queryClient.invalidateQueries({ queryKey: TASKS_KEY }),
  });
}

/** Add a Task from Quick add. It appears first in its Project, as the server places it. */
export function useCreateTask(projectId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (title: string) => {
      const { data } = await api.POST("/api/v1/tasks", {
        body: { title, project_id: projectId },
      });
      if (!data) {
        throw new Error("Could not add the task.");
      }
      return data;
    },
    onSuccess: (task) => {
      queryClient.setQueryData(openTasksQuery(projectId).queryKey, (tasks) =>
        tasks ? [task, ...tasks] : [task],
      );
    },
    onError: (error) => toast.error(error.message),
    onSettled: () => queryClient.invalidateQueries(sidebarQuery),
  });
}

/** Complete or reopen a Task. Completing takes it out of the open list straight away. */
export function useSetTaskStatus(projectId: number) {
  const queryClient = useQueryClient();
  const openKey = openTasksQuery(projectId).queryKey;
  return useMutation({
    mutationFn: async ({ id, status }: { id: number; status: TaskStatus }) => {
      const { data } = await api.PATCH("/api/v1/tasks/{task_id}", {
        params: { path: { task_id: id } },
        body: { status },
      });
      if (!data) {
        throw new Error("Could not update the task.");
      }
      return data;
    },
    onMutate: async ({ id, status }) => {
      if (status !== "open") {
        await queryClient.cancelQueries({ queryKey: openKey });
        queryClient.setQueryData(openKey, (tasks) => tasks?.filter((task) => task.id !== id));
      }
    },
    onError: (error) => toast.error(error.message),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: TASKS_KEY }),
        queryClient.invalidateQueries(sidebarQuery),
      ]),
  });
}
