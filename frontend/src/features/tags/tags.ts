import { arrayMove } from "@dnd-kit/sortable";
import { queryOptions } from "@tanstack/react-query";

import { api } from "@/api/client";
import { failureReason } from "@/api/errors";
import type { components } from "@/api/schema";
import { HUE } from "@/features/projects/project-style";
import type { PaletteColor } from "@/features/projects/projects";
import { taskKeys } from "@/features/tasks/task-cache";
import { sidebarQuery, type Task } from "@/features/tasks/tasks";
import { editing, useCacheMutation } from "@/lib/cache-mutation";

export type Tag = components["schemas"]["TagOut"];
export type SidebarTag = components["schemas"]["SidebarTagOut"];

/** A Tag's open Tasks across Projects as flat rows, a Subtask with its parent's title. */
export function tagTasksQuery(tagId: number) {
  return queryOptions({
    queryKey: taskKeys.open({ tag: tagId }),
    queryFn: async (): Promise<Task[]> => {
      const { data } = await api.GET("/api/v1/tasks", { params: { query: { tag: tagId } } });
      if (!data) {
        throw new Error("Could not load your tasks.");
      }
      return data.items;
    },
  });
}

/** The fields a Tag is created or edited with; a null colour shows it grey. */
export type TagFields = { name: string; color: PaletteColor | null };

/** Why a Tag name is refused before it reaches the server, or null when it's fine. */
export function tagNameProblem(name: string): string | null {
  if (/[\s#]/.test(name.trim())) return "Tag names can't have spaces or #.";
  return null;
}

/** A Tag with no colour is grey. */
const GREY = { text: "text-muted-foreground", soft: "bg-surface-muted", bg: "bg-muted-foreground" };

/** The classes for a Tag's colour, grey when it has none. */
export function tagHue(tag: Pick<Tag, "color">) {
  return tag.color ? HUE[tag.color] : GREY;
}

/**
 * A change to Tags. Every one refreshes the sidebar and the Task lists, because Tasks show their
 * Tags' names and colours; an optional `optimistic` edit shows it in the sidebar straight away.
 */
function useTagMutation<V, R>(
  change: (variables: V) => Promise<R>,
  optimistic?: (tags: SidebarTag[], variables: V) => SidebarTag[],
) {
  return useCacheMutation({
    mutationFn: change,
    ...(optimistic && {
      optimistic: editing(sidebarQuery.queryKey, (sidebar, variables: V) => ({
        ...sidebar,
        tags: optimistic(sidebar.tags, variables),
      })),
    }),
    refetch: [taskKeys.sidebar, taskKeys.all],
  });
}

/** Create a Tag last in the user's order. */
export function useCreateTag() {
  return useTagMutation(async (fields: TagFields): Promise<Tag> => {
    const { data, error } = await api.POST("/api/v1/tags", { body: fields });
    if (error) throw new Error(failureReason(error, "Could not create the tag."));
    return data;
  });
}

/** Rename or recolour a Tag; every Task with it shows the change. */
export function useUpdateTag() {
  return useTagMutation(async ({ id, ...fields }: { id: number } & TagFields) => {
    const { data, error } = await api.PATCH("/api/v1/tags/{tag_id}", {
      params: { path: { tag_id: id } },
      body: fields,
    });
    if (error) throw new Error(failureReason(error, "Could not save the tag."));
    return data;
  });
}

/** Move a Tag right after another, or first for null; the sidebar shows it there at once. */
export function useMoveTag() {
  return useTagMutation(
    async ({ id, afterId }: { id: number; afterId: number | null }) => {
      const { response } = await api.POST("/api/v1/tags/{tag_id}/move", {
        params: { path: { tag_id: id } },
        body: { after_id: afterId },
      });
      if (!response.ok) throw new Error("Could not move the tag.");
    },
    (tags, { id, afterId }) => moveAfter(tags, id, afterId),
  );
}

/** The Tags with one moved right after another, or first for null. */
export function moveAfter<T extends { id: number }>(tags: T[], id: number, afterId: number | null) {
  const moving = tags.find((tag) => tag.id === id);
  if (!moving) return tags;
  const rest = tags.filter((tag) => tag.id !== id);
  const index = afterId === null ? 0 : rest.findIndex((tag) => tag.id === afterId) + 1;
  return [...rest.slice(0, index), moving, ...rest.slice(index)];
}

/**
 * The Tag a dragged Tag now follows once dropped onto another's place, or null for first. Dropped
 * lower down it follows the Tag it was dropped on; dropped higher up it takes that Tag's place.
 */
export function dropAfter(tags: { id: number }[], id: number, overId: number) {
  const ids = tags.map((tag) => tag.id);
  const to = ids.indexOf(overId);
  const reordered = arrayMove(ids, ids.indexOf(id), to);
  return reordered[to - 1] ?? null;
}

/** Merge a Tag into another: its Tasks get the other Tag, and it's deleted. */
export function useMergeTag() {
  return useTagMutation(async ({ id, intoId }: { id: number; intoId: number }) => {
    const { error } = await api.POST("/api/v1/tags/{tag_id}/merge", {
      params: { path: { tag_id: id } },
      body: { into_id: intoId },
    });
    if (error) throw new Error(failureReason(error, "Could not merge the tags."));
  });
}

/** Delete a Tag for good, taking it off every Task. */
export function useDeleteTag() {
  return useTagMutation(async (id: number) => {
    const { response } = await api.DELETE("/api/v1/tags/{tag_id}", {
      params: { path: { tag_id: id } },
    });
    if (!response.ok) throw new Error("Could not delete the tag.");
  });
}
