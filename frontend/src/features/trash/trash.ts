import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { api } from "@/api/client";
import type { components } from "@/api/schema";
import { plainMentions } from "@/features/people/mentions";
import {
  DETAIL_KEY,
  OPEN_KEY,
  refreshTasks,
  type Task,
  type TaskDetail,
} from "@/features/tasks/tasks";

export type TrashedTask = components["schemas"]["TrashedTaskOut"];
export type TrashedProject = components["schemas"]["TrashedProjectOut"];
export type TrashedRow = TrashedTask | TrashedProject;
type Restored = components["schemas"]["TaskRestoreOut"];

/** The Trash: one row per deleted Task or Project unit, most recently deleted first. */
export const trashQuery = queryOptions({
  queryKey: ["trash"],
  queryFn: async (): Promise<TrashedRow[]> => {
    const { data } = await api.GET("/api/v1/trash");
    if (!data) {
      throw new Error("Could not load the Trash.");
    }
    return data;
  },
});

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

/** Where a restored Task went, as its toast says it. */
function restoredMessage({ project }: Restored) {
  return `Restored to ${project.name}${project.is_archived ? " (archived)" : ""}`;
}

/**
 * Bring a Task back from Trash with everything deleted along with it. A toast says where it
 * went, which matters when its Project is archived or gone.
 */
export function useRestoreTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (taskId: number) => {
      const { data } = await api.POST("/api/v1/tasks/{task_id}/restore", {
        params: { path: { task_id: taskId } },
      });
      if (!data) {
        throw new Error("Could not restore the task.");
      }
      return data;
    },
    onMutate: async (taskId) => {
      await queryClient.cancelQueries(trashQuery);
      queryClient.setQueryData(trashQuery.queryKey, (rows) =>
        rows?.filter((row) => row.kind !== "task" || row.id !== taskId),
      );
    },
    onSuccess: (restored) => toast(restoredMessage(restored)),
    onError: (error) => toast.error(error.message),
    onSettled: () =>
      Promise.all([refreshTasks(queryClient), queryClient.invalidateQueries(trashQuery)]),
  });
}

/** The same Trash row: Tasks and Projects have separate ids. */
function sameRow(a: TrashedRow, b: TrashedRow) {
  return a.kind === b.kind && a.id === b.id;
}

/** Delete Trash rows for good: each takes the whole unit it went to Trash with. */
export function useDeleteForever() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (rows: TrashedRow[]) => {
      const ids = (kind: TrashedRow["kind"]) =>
        rows.filter((row) => row.kind === kind).map((row) => row.id);
      const { error } = await api.POST("/api/v1/trash/delete", {
        body: { task_ids: ids("task"), project_ids: ids("project") },
      });
      if (error) {
        throw new Error("Could not delete it forever.");
      }
    },
    onMutate: async (gone) => {
      await queryClient.cancelQueries(trashQuery);
      queryClient.setQueryData(trashQuery.queryKey, (rows) =>
        rows?.filter((row) => !gone.some((other) => sameRow(row, other))),
      );
    },
    onError: (error) => toast.error(error.message),
    onSettled: () => queryClient.invalidateQueries(trashQuery),
  });
}

/** Delete everything in the Trash for good. */
export function useEmptyTrash() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { response } = await api.DELETE("/api/v1/trash");
      if (!response.ok) {
        throw new Error("Could not empty the Trash.");
      }
    },
    onMutate: async () => {
      await queryClient.cancelQueries(trashQuery);
      queryClient.setQueryData(trashQuery.queryKey, []);
    },
    onError: (error) => toast.error(error.message),
    onSettled: () => queryClient.invalidateQueries(trashQuery),
  });
}

/**
 * Move a Task and its Subtasks to Trash, then offer Undo in a toast. It leaves every list and
 * drawer before the server answers.
 */
export function useDeleteTask() {
  const queryClient = useQueryClient();
  const { mutate: restore } = useRestoreTask();
  return useMutation({
    mutationFn: async (task: Task) => {
      const { error } = await api.DELETE("/api/v1/tasks/{task_id}", {
        params: { path: { task_id: task.id } },
      });
      if (error) {
        throw new Error("detail" in error ? error.detail : "Could not delete the task.");
      }
    },
    onMutate: async (task) => {
      await queryClient.cancelQueries({ queryKey: OPEN_KEY });
      await queryClient.cancelQueries({ queryKey: DETAIL_KEY });
      queryClient.setQueriesData<Task[]>(
        { queryKey: OPEN_KEY },
        (rows) => rows && withoutTree(rows, task.id),
      );
      queryClient.setQueriesData<TaskDetail>(
        { queryKey: DETAIL_KEY },
        (detail) => detail && { ...detail, subtasks: withoutTree(detail.subtasks, task.id) },
      );
    },
    onSuccess: (_, task) => {
      toast(`Moved “${plainMentions(task.title)}” to Trash`, {
        action: {
          label: "Undo",
          onClick: () => {
            restore(task.id);
          },
        },
      });
    },
    onError: (error) => toast.error(error.message),
    onSettled: () =>
      Promise.all([refreshTasks(queryClient), queryClient.invalidateQueries(trashQuery)]),
  });
}

/**
 * Bring a Project back from Trash with the Tasks deleted along with it. The toast names it, as
 * it comes back renamed when its name was taken in the meantime.
 */
export function useRestoreProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (projectId: number) => {
      const { data } = await api.POST("/api/v1/projects/{project_id}/restore", {
        params: { path: { project_id: projectId } },
      });
      if (!data) {
        throw new Error("Could not restore the project.");
      }
      return data;
    },
    onMutate: async (projectId) => {
      await queryClient.cancelQueries(trashQuery);
      queryClient.setQueryData(trashQuery.queryKey, (rows) =>
        rows?.filter((row) => row.kind !== "project" || row.id !== projectId),
      );
    },
    onSuccess: (project) => toast(`Restored “${project.name}”`),
    onError: (error) => toast.error(error.message),
    onSettled: () =>
      Promise.all([refreshTasks(queryClient), queryClient.invalidateQueries(trashQuery)]),
  });
}
