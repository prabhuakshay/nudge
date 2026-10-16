import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { api } from "@/api/client";
import type { components } from "@/api/schema";
import { refreshTasks } from "@/features/tasks/tasks";

export type Section = components["schemas"]["SectionOut"];
export type SectionFields = components["schemas"]["SectionIn"];
type SectionMove = components["schemas"]["SectionMoveIn"] & { id: number };

/** The key prefix of every Project's Sections, kept apart from Tasks so Task changes skip them. */
export const SECTIONS_KEY = ["sections"] as const;

/** A Project's Sections in order. The Inbox has none, so don't ask for its. */
export function sectionsQuery(projectId: number) {
  return queryOptions({
    queryKey: [...SECTIONS_KEY, projectId],
    queryFn: async (): Promise<Section[]> => {
      const { data } = await api.GET("/api/v1/projects/{project_id}/sections", {
        params: { path: { project_id: projectId } },
      });
      if (!data) {
        throw new Error("Could not load the sections.");
      }
      return data;
    },
  });
}

/**
 * A change to a Project's Sections. It refreshes them once the server answers, and shows the
 * server's reason when it refuses.
 */
function useSectionMutation<V, R>(projectId: number, change: (variables: V) => Promise<R>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: change,
    onError: (error) => toast.error(error.message),
    onSettled: () => queryClient.invalidateQueries(sectionsQuery(projectId)),
  });
}

/** Add a Section to a Project, last unless `after_id` names the one it follows. */
export function useCreateSection(projectId: number) {
  return useSectionMutation(projectId, async (fields: SectionFields) => {
    const { data, error } = await api.POST("/api/v1/projects/{project_id}/sections", {
      params: { path: { project_id: projectId } },
      body: fields,
    });
    if (error) throw new Error(error.detail);
    return data;
  });
}

/** Put a Section right after `after_id` among its Project's Sections, or first for null. */
export function useMoveSection(projectId: number) {
  return useSectionMutation(projectId, async ({ id, after_id }: SectionMove) => {
    const { error } = await api.POST("/api/v1/sections/{section_id}/move", {
      params: { path: { section_id: id } },
      body: { after_id },
    });
    if (error) throw new Error(error.detail);
  });
}

/** Delete a Section for good. Its Tasks stay in the Project, in No section. */
export function useDeleteSection(projectId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (sectionId: number) => {
      const { error } = await api.DELETE("/api/v1/sections/{section_id}", {
        params: { path: { section_id: sectionId } },
      });
      if (error) throw new Error(error.detail);
    },
    onError: (error) => toast.error(error.message),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries(sectionsQuery(projectId)),
        refreshTasks(queryClient),
      ]),
  });
}
