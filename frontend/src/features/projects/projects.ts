import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { api } from "@/api/client";
import type { components } from "@/api/schema";
import {
  refreshTasks,
  sidebarQuery,
  type Sidebar,
  type SidebarProject,
} from "@/features/tasks/tasks";
import { trashQuery, useRestoreProject } from "@/features/trash/trash";
import { toastWithUndo } from "@/lib/undo-toast";

import { applyPlacement, type Placement, type SiblingRef } from "./sidebar-order";

export type { Sidebar, SidebarProject };
export type SidebarItem = Sidebar["items"][number];
export type SidebarFolder = components["schemas"]["SidebarFolderOut"];
export type PaletteColor = components["schemas"]["PaletteColor"];
export type ProjectIconKey = components["schemas"]["Icon"];
export type ProjectFields = components["schemas"]["ProjectIn"];
export type ProjectLayout = components["schemas"]["Layout"];

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

/** A Project and the fields of it to change. */
type ProjectChange = { id: number } & Partial<
  Pick<SidebarProject, "name" | "color" | "icon" | "layout">
>;

/**
 * Rename, recolour or change the icon or Layout of a Project; the sidebar and its page show the
 * change at once.
 */
export function useUpdateProject() {
  return useSidebarMutation(
    async ({ id, ...fields }: ProjectChange) => {
      const { data, error } = await api.PATCH("/api/v1/projects/{project_id}", {
        params: { path: { project_id: id } },
        body: fields,
      });
      if (error) throw new Error(error.detail);
      return data;
    },
    (sidebar, { id, ...fields }) => withProjectChanged(sidebar, id, fields),
  );
}

/** The sidebar with one Project's fields changed, wherever it sits. */
function withProjectChanged(
  sidebar: Sidebar,
  id: number,
  change: Partial<SidebarProject>,
): Sidebar {
  const apply = (project: SidebarProject) =>
    project.id === id ? { ...project, ...change } : project;
  return {
    ...sidebar,
    items: sidebar.items.map((item) =>
      item.kind === "folder" ? { ...item, projects: item.projects.map(apply) } : apply(item),
    ),
    archived: sidebar.archived.map(apply),
  };
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

/** The sidebar without a Project, wherever it sits. */
function withoutProject(sidebar: Sidebar, id: number): Sidebar {
  const keep = (project: SidebarProject) => project.id !== id;
  return {
    ...sidebar,
    items: sidebar.items
      .filter((item) => item.kind === "folder" || keep(item))
      .map((item) =>
        item.kind === "folder" ? { ...item, projects: item.projects.filter(keep) } : item,
      ),
    archived: sidebar.archived.filter(keep),
  };
}

/**
 * Move a Project and its Tasks to Trash, then offer Undo in a toast. It leaves the sidebar
 * before the server answers.
 */
export function useDeleteProject() {
  const queryClient = useQueryClient();
  const { mutate: restore } = useRestoreProject();
  return useMutation({
    mutationFn: async (project: SidebarProject) => {
      const { error } = await api.DELETE("/api/v1/projects/{project_id}", {
        params: { path: { project_id: project.id } },
      });
      if (error) throw new Error(error.detail);
    },
    onMutate: async (project) => {
      await queryClient.cancelQueries(sidebarQuery);
      queryClient.setQueryData(
        sidebarQuery.queryKey,
        (sidebar) => sidebar && withoutProject(sidebar, project.id),
      );
    },
    onSuccess: (_, project) => {
      toastWithUndo(`Moved “${project.name}” to Trash`, () => {
        restore(project.id);
      });
    },
    onError: (error) => toast.error(error.message),
    onSettled: () =>
      Promise.all([refreshTasks(queryClient), queryClient.invalidateQueries(trashQuery)]),
  });
}
