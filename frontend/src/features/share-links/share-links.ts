import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "@/api/client";
import { failureReason } from "@/api/errors";
import type { components } from "@/api/schema";

export type ShareLink = components["schemas"]["ShareLinkOut"];
export type ShareReport = components["schemas"]["ShareReportOut"];
export type NewShareLink = components["schemas"]["ShareLinkIn"];
export type ShareLinkChange = components["schemas"]["ShareLinkPatchIn"];

/** What a Share link's address shows: its report, or why there is none. */
export type ShareReportAnswer =
  { kind: "report"; report: ShareReport } | { kind: "inactive" } | { kind: "missing" };

/** The report behind a Share link's key. Opening it records the time on the owner's side. */
export function shareReportQuery(key: string) {
  return queryOptions({
    queryKey: ["share-report", key],
    queryFn: async (): Promise<ShareReportAnswer> => {
      const { data, response } = await api.GET("/api/v1/share/{key}", {
        params: { path: { key } },
      });
      if (data) return { kind: "report", report: data };
      if (response.status === 410) return { kind: "inactive" };
      if (response.status === 404) return { kind: "missing" };
      throw new Error("Could not load this report.");
    },
  });
}

/** A Project's Share links that haven't been stopped, oldest first. */
export function shareLinksQuery(projectId: number) {
  return queryOptions({
    queryKey: ["share-links", projectId],
    queryFn: async (): Promise<ShareLink[]> => {
      const { data } = await api.GET("/api/v1/projects/{project_id}/share-links", {
        params: { path: { project_id: projectId } },
      });
      if (!data) throw new Error("Could not load the Share links.");
      return data;
    },
  });
}

/** Shares the Project with a new link, which joins the end of its list. */
export function useCreateShareLink(projectId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (settings: NewShareLink) => {
      const { data, error } = await api.POST("/api/v1/projects/{project_id}/share-links", {
        params: { path: { project_id: projectId } },
        body: settings,
      });
      if (!data) throw new Error(failureReason(error, "Couldn't create a Share link."));
      return data;
    },
    onSuccess: (created) => {
      queryClient.setQueryData(shareLinksQuery(projectId).queryKey, (links = []) => [
        ...links,
        created,
      ]);
    },
  });
}

/** Changes a Share link's expiry or timeline range; its address stays the same. */
export function useUpdateShareLink(projectId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ linkId, change }: { linkId: number; change: ShareLinkChange }) => {
      const { data, error } = await api.PATCH("/api/v1/share-links/{link_id}", {
        params: { path: { link_id: linkId } },
        body: change,
      });
      if (!data) throw new Error(failureReason(error, "Couldn't change that Share link."));
      return data;
    },
    onSuccess: (changed) => {
      queryClient.setQueryData(shareLinksQuery(projectId).queryKey, (links = []) =>
        links.map((link) => (link.id === changed.id ? changed : link)),
      );
    },
  });
}

/** Stops a Share link, so its address says it is no longer active, and takes it off the list. */
export function useStopShareLink(projectId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (linkId: number) => {
      const { response } = await api.POST("/api/v1/share-links/{link_id}/stop", {
        params: { path: { link_id: linkId } },
      });
      if (!response.ok) throw new Error("Couldn't stop sharing that link.");
      return linkId;
    },
    onSuccess: (linkId) => {
      queryClient.setQueryData(shareLinksQuery(projectId).queryKey, (links = []) =>
        links.filter(({ id }) => id !== linkId),
      );
    },
  });
}
