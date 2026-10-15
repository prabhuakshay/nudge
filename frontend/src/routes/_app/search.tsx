import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { SearchView } from "@/features/search/search-view";
import { validateTaskSearch, type TaskSearch } from "@/features/tasks/open-task";
import { sidebarQuery } from "@/features/tasks/tasks";

/** The Search route's parameters: the words searched for, and the Task open in the drawer. */
type SearchParams = TaskSearch & { q?: string };

function validateSearch(search: Record<string, unknown>): SearchParams {
  const { q } = search;
  // A number-like `?q=42` arrives parsed as a number, but it's still words to search for.
  const words = typeof q === "string" || typeof q === "number" ? String(q) : "";
  return { ...validateTaskSearch(search), ...(words && { q: words }) };
}

export const Route = createFileRoute("/_app/search")({
  validateSearch,
  loader: ({ context }) => context.queryClient.query(sidebarQuery),
  component: SearchPage,
});

function SearchPage() {
  // Read once: from here on the search box leads and the URL follows it.
  const { q } = Route.useSearch();
  const { data: sidebar } = useSuspenseQuery(sidebarQuery);
  return <SearchView initialQuery={q ?? ""} inbox={sidebar.inbox} />;
}
