import { queryOptions } from "@tanstack/react-query";
import { toast } from "sonner";

import { api } from "@/api/client";
import { failureReason } from "@/api/errors";
import type { components } from "@/api/schema";
import { plainMentions } from "@/features/people/mentions";
import { TASK_REFETCH, useTaskMutation } from "@/features/tasks/task-cache";
import type { Task } from "@/features/tasks/tasks";
import { editing, useCacheMutation } from "@/lib/cache-mutation";
import { plural } from "@/lib/plural";
import { toastWithUndo } from "@/lib/undo-toast";

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

/** What a change between the Trash and the Tasks refetches: both, and the sidebar's counts. */
const TASKS_AND_TRASH = [...TASK_REFETCH, trashQuery.queryKey];

/** Where a restored Task went, as its toast says it. */
function restoredMessage({ project }: Restored) {
  return `Restored to ${project.name}${project.is_archived ? " (archived)" : ""}`;
}

/**
 * Bring a Task back from Trash with everything deleted along with it. A toast says where it
 * went, which matters when its Project is archived or gone.
 */
export function useRestoreTask() {
  return useCacheMutation({
    mutationFn: async (taskId: number) => {
      const { data, error } = await api.POST("/api/v1/tasks/{task_id}/restore", {
        params: { path: { task_id: taskId } },
      });
      if (!data) {
        throw new Error(failureReason(error, "Could not restore the task."));
      }
      return data;
    },
    optimistic: editing(trashQuery.queryKey, (rows, taskId: number) =>
      rows.filter((row) => row.kind !== "task" || row.id !== taskId),
    ),
    onSuccess: (restored) => toast(restoredMessage(restored)),
    refetch: TASKS_AND_TRASH,
  });
}

/** A Trash row's key, unique across Tasks and Projects, which have separate ids. */
export function rowKey(row: TrashedRow) {
  return `${row.kind}-${String(row.id)}`;
}

/** Takes rows out of the Trash before the server answers. */
const dropFromTrash = editing(trashQuery.queryKey, (rows, gone: TrashedRow[]) => {
  const keys = new Set(gone.map(rowKey));
  return rows.filter((row) => !keys.has(rowKey(row)));
});

/** Bring one Trash row back: a Task unit or a Project. */
async function restoreRow(row: TrashedRow) {
  const { response } =
    row.kind === "project"
      ? await api.POST("/api/v1/projects/{project_id}/restore", {
          params: { path: { project_id: row.id } },
        })
      : await api.POST("/api/v1/tasks/{task_id}/restore", {
          params: { path: { task_id: row.id } },
        });
  if (!response.ok) {
    throw new Error("Could not restore everything selected.");
  }
}

/** Bring several Trash rows back at once, with one toast for all of them. */
export function useRestoreRows() {
  return useCacheMutation({
    mutationFn: (rows: TrashedRow[]) => Promise.all(rows.map(restoreRow)),
    optimistic: dropFromTrash,
    onSuccess: (_, rows) => toast(`Restored ${plural(rows.length, "item")}`),
    refetch: TASKS_AND_TRASH,
  });
}

/** Delete Trash rows for good: each takes the whole unit it went to Trash with. */
export function useDeleteForever() {
  return useCacheMutation({
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
    optimistic: dropFromTrash,
    refetch: [trashQuery.queryKey],
  });
}

/** Delete everything in the Trash for good. */
export function useEmptyTrash() {
  return useCacheMutation({
    mutationFn: async () => {
      const { response } = await api.DELETE("/api/v1/trash");
      if (!response.ok) {
        throw new Error("Could not empty the Trash.");
      }
    },
    optimistic: editing(trashQuery.queryKey, () => []),
    refetch: [trashQuery.queryKey],
  });
}

/**
 * Move a Task and its Subtasks to Trash, then offer Undo in a toast. It leaves every list and
 * drawer before the server answers.
 */
export function useDeleteTask() {
  const { mutate: restore } = useRestoreTask();
  return useTaskMutation({
    mutationFn: async (task: Task) => {
      const { error } = await api.DELETE("/api/v1/tasks/{task_id}", {
        params: { path: { task_id: task.id } },
      });
      if (error) {
        throw new Error(failureReason(error, "Could not delete the task."));
      }
    },
    changes: (task) => [{ kind: "remove", taskId: task.id }],
    onSuccess: (_, task) => {
      toastWithUndo(`Moved “${plainMentions(task.title)}” to Trash`, () => {
        restore(task.id);
      });
    },
    alsoRefetch: [trashQuery.queryKey],
  });
}

/**
 * Bring a Project back from Trash with the Tasks deleted along with it. The toast names it, as
 * it comes back renamed when its name was taken in the meantime.
 */
export function useRestoreProject() {
  return useCacheMutation({
    mutationFn: async (projectId: number) => {
      const { data, error } = await api.POST("/api/v1/projects/{project_id}/restore", {
        params: { path: { project_id: projectId } },
      });
      if (!data) {
        throw new Error(failureReason(error, "Could not restore the project."));
      }
      return data;
    },
    optimistic: editing(trashQuery.queryKey, (rows, projectId: number) =>
      rows.filter((row) => row.kind !== "project" || row.id !== projectId),
    ),
    onSuccess: (project) => toast(`Restored “${project.name}”`),
    refetch: TASKS_AND_TRASH,
  });
}
