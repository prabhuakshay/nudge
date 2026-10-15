/* Mutations that put a Task somewhere new. The server picks the place, so every list refetches. */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { api } from "@/api/client";

import { refreshTasks } from "./tasks";

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
    onSettled: () => refreshTasks(queryClient),
  });
}

/** Copy a Task to right after it, as the server places it. */
export function useDuplicateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (taskId: number) => {
      const { data } = await api.POST("/api/v1/tasks/{task_id}/duplicate", {
        params: { path: { task_id: taskId } },
      });
      if (!data) {
        throw new Error("Could not duplicate the task.");
      }
      return data;
    },
    onError: (error) => toast.error(error.message),
    onSettled: () => refreshTasks(queryClient),
  });
}

/**
 * Add a Subtask last under a Task. The server reopens the parent if it was Closed, so every list
 * and drawer refetches.
 */
export function useCreateSubtask(parentId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (title: string) => {
      const { data } = await api.POST("/api/v1/tasks", {
        body: { title, parent_id: parentId },
      });
      if (!data) {
        throw new Error("Could not add the subtask.");
      }
      return data;
    },
    onError: (error) => toast.error(error.message),
    onSettled: () => refreshTasks(queryClient),
  });
}
