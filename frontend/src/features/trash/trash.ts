import { queryOptions } from "@tanstack/react-query";
import { toast } from "sonner";

import { api } from "@/api/client";
import { failureReason } from "@/api/errors";
import type { components } from "@/api/schema";
import { TASK_REFETCH } from "@/features/tasks/task-cache";
import { editing, useCacheMutation } from "@/lib/cache-mutation";
import { plural } from "@/lib/plural";

export type TrashedTask = components["schemas"]["TrashedTaskOut"];
export type TrashedProject = components["schemas"]["TrashedProjectOut"];
export type TrashedRow = TrashedTask | TrashedProject;

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

/** A Trash row to bring back, by its kind and id. */
export type TrashRef = Pick<TrashedRow, "kind" | "id">;

/** A Trash row's key, unique across Tasks and Projects, which have separate ids. */
export function rowKey(row: TrashRef) {
  return `${row.kind}-${String(row.id)}`;
}

/** Takes rows out of the Trash before the server answers. */
const dropFromTrash = editing(trashQuery.queryKey, (rows, gone: TrashRef[]) => {
  const keys = new Set(gone.map(rowKey));
  return rows.filter((row) => !keys.has(rowKey(row)));
});

/**
 * Bring one Trash row back: a Task unit or a Project. Returns what its toast says when it comes
 * back alone: where a Task went, which matters when its Project is archived or gone, or a
 * Project's name, as it comes back renamed when its name was taken in the meantime.
 */
async function restoreRow(row: TrashRef): Promise<string> {
  if (row.kind === "project") {
    const { data, error } = await api.POST("/api/v1/projects/{project_id}/restore", {
      params: { path: { project_id: row.id } },
    });
    if (!data) throw new Error(failureReason(error, "Could not restore the project."));
    return `Restored “${data.name}”`;
  }
  const { data, error } = await api.POST("/api/v1/tasks/{task_id}/restore", {
    params: { path: { task_id: row.id } },
  });
  if (!data) throw new Error(failureReason(error, "Could not restore the task."));
  const { project } = data;
  return `Restored to ${project.name}${project.is_archived ? " (archived)" : ""}`;
}

/**
 * Bring Trash rows back with everything deleted along with them, as the Trash and Undo of a
 * delete do. One toast says what came back; a failure toasts the reason.
 */
export function useRestoreFromTrash() {
  return useCacheMutation({
    mutationFn: (rows: TrashRef[]) => Promise.all(rows.map(restoreRow)),
    optimistic: dropFromTrash,
    onSuccess: (messages) => {
      const [only] = messages;
      toast(only && messages.length === 1 ? only : `Restored ${plural(messages.length, "item")}`);
    },
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
