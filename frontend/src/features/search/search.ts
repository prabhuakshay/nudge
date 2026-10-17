import { queryOptions } from "@tanstack/react-query";

import { api } from "@/api/client";
import type { components } from "@/api/schema";
import { taskKeys } from "@/features/tasks/task-cache";

/** A Task that matched a search, with where it matched and the text around the match. */
export type SearchResult = components["schemas"]["TaskSearchOut"];

/** The server refuses shorter searches, so nothing is sent until the query is this long. */
export const MIN_QUERY_LENGTH = 2;

/** Whether a query is long enough to search for. */
export function isSearchable(query: string) {
  return query.trim().length >= MIN_QUERY_LENGTH;
}

/**
 * The Tasks matching every word of the query, best first. Keyed under the Task lists, so a change
 * to a Task refreshes the results too.
 */
export function searchQuery(query: string) {
  const q = query.trim();
  return queryOptions({
    queryKey: taskKeys.search(q),
    queryFn: async (): Promise<SearchResult[]> => {
      const { data } = await api.GET("/api/v1/tasks/search", { params: { query: { q } } });
      if (!data) {
        throw new Error("Could not search your tasks.");
      }
      return data;
    },
    enabled: isSearchable(q),
  });
}
