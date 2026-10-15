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
export type TaskStatus = components["schemas"]["Status"];
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
