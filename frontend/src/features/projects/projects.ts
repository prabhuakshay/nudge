import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { api } from "@/api/client";
import type { components } from "@/api/schema";
import { sidebarQuery, type Sidebar, type SidebarProject } from "@/features/tasks/tasks";
import { toastWithUndo } from "@/lib/undo-toast";

import { applyPlacement, type Placement, type SiblingRef } from "./sidebar-order";

export type { Sidebar, SidebarProject };
export type SidebarItem = Sidebar["items"][number];
export type SidebarFolder = components["schemas"]["SidebarFolderOut"];
export type PaletteColor = components["schemas"]["PaletteColor"];
export type ProjectIconKey = components["schemas"]["Icon"];
export type ProjectFields = components["schemas"]["ProjectIn"];

/** The palette in the order the colour picker shows it. */
export const PALETTE: readonly PaletteColor[] = [
  "red",
  "orange",
  "amber",
  "green",
  "teal",
  "blue",
  "violet",
  "pink",
];

/** One of the user's Projects, archived or not, or undefined if it isn't in the sidebar. */
export function findProject(sidebar: Sidebar, id: number): SidebarProject | undefined {
  return [...allProjects(sidebar), ...sidebar.archived].find((project) => project.id === id);
}

/** Every live, unarchived Project in sidebar order, Folders flattened away, the Inbox first. */
export function allProjects(sidebar: Sidebar): SidebarProject[] {
  return [
    sidebar.inbox,
    ...sidebar.items.flatMap((item) => (item.kind === "folder" ? item.projects : [item])),
  ];
}

/**
 * A change to Projects or Folders. Every one refreshes the sidebar; an optional `optimistic`
 * edit shows the change in the sidebar before the server answers.
 */
function useSidebarMutation<V, R>(
  change: (variables: V) => Promise<R>,
  optimistic?: (sidebar: Sidebar, variables: V) => Sidebar,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: change,
    onMutate: async (variables) => {
      if (!optimistic) return;
      await queryClient.cancelQueries(sidebarQuery);
      queryClient.setQueryData(
        sidebarQuery.queryKey,
        (sidebar) => sidebar && optimistic(sidebar, variables),
      );
    },
    onError: (error) => toast.error(error.message),
    onSettled: () => queryClient.invalidateQueries(sidebarQuery),
  });
}

/** Create a Project; it appears last in its Folder, or last in the sidebar. */
export function useCreateProject() {
  return useSidebarMutation(async (fields: ProjectFields) => {
    const { data, error } = await api.POST("/api/v1/projects", { body: fields });
    if (error) throw new Error(error.detail);
    return data;
  });
}

/** Rename, recolour or change the icon of a Project. */
export function useUpdateProject() {
  return useSidebarMutation(
    async ({ id, ...fields }: { id: number } & Partial<Omit<ProjectFields, "folder_id">>) => {
      const { data, error } = await api.PATCH("/api/v1/projects/{project_id}", {
        params: { path: { project_id: id } },
        body: fields,
      });
      if (error) throw new Error(error.detail);
      return data;
    },
  );
}

/** Move a Project into a Folder or onto the top level; the sidebar shows it there at once. */
export function useMoveProject() {
  return useSidebarMutation(
    async ({ id, placement }: { id: number; placement: Placement }) => {
      const { response } = await api.POST("/api/v1/projects/{project_id}/move", {
        params: { path: { project_id: id } },
        body: { folder_id: placement.folderId, after: placement.after },
      });
      if (!response.ok) throw new Error("Could not move the project.");
    },
    (sidebar, { id, placement }) => applyPlacement(sidebar, { kind: "project", id }, placement),
  );
}

/** Create an expanded Folder last in the sidebar. */
export function useCreateFolder() {
  return useSidebarMutation(async (name: string) => {
    const { data } = await api.POST("/api/v1/folders", { body: { name } });
    if (!data) throw new Error("Could not create the folder.");
    return data;
  });
}

type FolderChange = { id: number; name?: string; collapsed?: boolean };

/** Rename a Folder, or collapse or expand it; the sidebar shows the change at once. */
export function useUpdateFolder() {
  return useSidebarMutation(
    async ({ id, ...fields }: FolderChange) => {
      const { data } = await api.PATCH("/api/v1/folders/{folder_id}", {
        params: { path: { folder_id: id } },
        body: fields,
      });
      if (!data) throw new Error("Could not save the folder.");
      return data;
    },
    (sidebar, { id, ...fields }) => ({
      ...sidebar,
      items: sidebar.items.map((item) =>
        item.kind === "folder" && item.id === id ? { ...item, ...fields } : item,
      ),
    }),
  );
}

/** Move a Folder on the sidebar's top level; the sidebar shows it there at once. */
export function useMoveFolder() {
  return useSidebarMutation(
    async ({ id, after }: { id: number; after: SiblingRef | null }) => {
      const { response } = await api.POST("/api/v1/folders/{folder_id}/move", {
        params: { path: { folder_id: id } },
        body: { after },
      });
      if (!response.ok) throw new Error("Could not move the folder.");
    },
    (sidebar, { id, after }) =>
      applyPlacement(sidebar, { kind: "folder", id }, { folderId: null, after }),
  );
}

/** Delete a Folder; its Projects stay in the sidebar where it was. */
export function useDeleteFolder() {
  return useSidebarMutation(async (id: number) => {
    const { response } = await api.DELETE("/api/v1/folders/{folder_id}", {
      params: { path: { folder_id: id } },
    });
    if (!response.ok) throw new Error("Could not delete the folder.");
  });
}

/**
 * Archive a Project or bring it back. Either way it moves between the Projects and Archived
 * sections, and the toast offers to undo it.
 */
export function useSetArchived() {
  const setArchived = useSidebarMutation(
    async ({ project, archived }: { project: SidebarProject; archived: boolean }) => {
      const params = { path: { project_id: project.id } };
      const { error } = archived
        ? await api.POST("/api/v1/projects/{project_id}/archive", { params })
        : await api.POST("/api/v1/projects/{project_id}/unarchive", { params });
      if (error) throw new Error(error.detail);
    },
  );
  return (project: SidebarProject, archived: boolean) => {
    setArchived.mutate(
      { project, archived },
      {
        onSuccess: () => {
          toastWithUndo(
            archived ? `Archived “${project.name}”` : `Unarchived “${project.name}”`,
            () => {
              setArchived.mutate({ project, archived: !archived });
            },
          );
        },
      },
    );
  };
}
