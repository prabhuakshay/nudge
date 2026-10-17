/* Mutations that put a Task somewhere new. The server picks the place, so every list refetches. */

import { api } from "@/api/client";
import { failureReason } from "@/api/errors";

import { useTaskMutation, type TaskMove } from "./task-cache";
import type { NewTask } from "./tasks";

/**
 * Move a Task, with its Subtasks, under a new parent or to the top level after a sibling. Lists
 * and drawers show it in its new place straight away; the server picks the key and checks the
 * rules, and a refusal puts it back where it was and comes back as a toast with its reason.
 */
export function useMoveTask() {
  return useTaskMutation({
    mutationFn: async ({ taskId, parentId, afterId, sectionId }: TaskMove) => {
      const section = sectionId === undefined ? {} : { section_id: sectionId };
      const { data, error } = await api.POST("/api/v1/tasks/{task_id}/move", {
        params: { path: { task_id: taskId } },
        body: { parent_id: parentId, after_id: afterId, ...section },
      });
      if (error) {
        throw new Error(failureReason(error, "Could not move the task."));
      }
      return data;
    },
    changes: (move) => [{ kind: "move", move }],
  });
}

/** Copy a Task to right after it, as the server places it. */
export function useDuplicateTask() {
  return useTaskMutation({
    mutationFn: async (taskId: number) => {
      const { data, error } = await api.POST("/api/v1/tasks/{task_id}/duplicate", {
        params: { path: { task_id: taskId } },
      });
      if (!data) {
        throw new Error(failureReason(error, "Could not duplicate the task."));
      }
      return data;
    },
  });
}

/**
 * Add a Subtask last under a Task, with its Priority and Tags. It shows under its parent once the
 * server answers; the server reopens the parent if it was Closed, so every list and drawer
 * refetches.
 */
export function useCreateSubtask(parentId: number) {
  return useTaskMutation({
    mutationFn: async (subtask: Omit<NewTask, "parent_id" | "project_id" | "dates">) => {
      const { data, error } = await api.POST("/api/v1/tasks", {
        body: { ...subtask, parent_id: parentId },
      });
      if (!data) {
        throw new Error(failureReason(error, "Could not add the subtask."));
      }
      return data;
    },
    answered: (task) => [{ kind: "insert", task }],
  });
}
