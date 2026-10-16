import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { api } from "@/api/client";
import type { components } from "@/api/schema";
import { refreshTasks } from "@/features/tasks/tasks";

export type Section = components["schemas"]["SectionOut"];
export type SectionFields = components["schemas"]["SectionIn"];
type SectionMove = components["schemas"]["SectionMoveIn"] & { id: number };

/** As long as the server allows, so a name field stops where the server would refuse. */
export const SECTION_NAME_MAX_LENGTH = 64;

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
 * server's reason when it refuses. An optional `optimistic` edit shows the change at once, and
 * `changesTasks` refreshes the Tasks too, for a change that moves them.
 */
function useSectionMutation<V, R>(
  projectId: number,
  change: (variables: V) => Promise<R>,
  {
    optimistic,
    changesTasks = false,
  }: {
    optimistic?: (sections: Section[], variables: V) => Section[];
    changesTasks?: boolean;
  } = {},
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: change,
    onMutate: async (variables) => {
      if (!optimistic) return;
      const query = sectionsQuery(projectId);
      await queryClient.cancelQueries(query);
      queryClient.setQueryData(
        query.queryKey,
        (sections) => sections && optimistic(sections, variables),
      );
    },
    onError: (error) => toast.error(error.message),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries(sectionsQuery(projectId)),
        changesTasks && refreshTasks(queryClient),
      ]),
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

type SectionChange = { id: number } & components["schemas"]["SectionPatchIn"];

/** Rename a Section, or collapse or expand it; the list shows the change at once. */
export function useUpdateSection(projectId: number) {
  return useSectionMutation(
    projectId,
    async ({ id, ...fields }: SectionChange) => {
      const { data, error } = await api.PATCH("/api/v1/sections/{section_id}", {
        params: { path: { section_id: id } },
        body: fields,
      });
      if (error) throw new Error(error.detail);
      return data;
    },
    {
      optimistic: (sections, { id, name, collapsed }) =>
        sections.map((section) =>
          section.id === id
            ? {
                ...section,
                name: name?.trim() ?? section.name,
                collapsed: collapsed ?? section.collapsed,
              }
            : section,
        ),
    },
  );
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
  return useSectionMutation(
    projectId,
    async (sectionId: number) => {
      const { error } = await api.DELETE("/api/v1/sections/{section_id}", {
        params: { path: { section_id: sectionId } },
      });
      if (error) throw new Error(error.detail);
    },
    { changesTasks: true },
  );
}
