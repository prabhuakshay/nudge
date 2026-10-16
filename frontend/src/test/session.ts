import { QueryClient } from "@tanstack/react-query";

import { sessionQuery, type User } from "@/features/auth/session";

/** A signed-in user whose sidebar sections are all expanded, as a test of their rows needs. */
export const EXPANDED_USER: User = {
  id: 1,
  email: "ada@example.com",
  full_name: "Ada Lovelace",
  time_zone: "Europe/London",
  single_key_shortcuts: true,
  projects_collapsed: false,
  tags_collapsed: false,
  people_collapsed: false,
};

/** A query client with `user` already signed in, so components read the session from cache. */
export function signedInClient(user: User = EXPANDED_USER): QueryClient {
  const queryClient = new QueryClient();
  queryClient.setQueryData(sessionQuery.queryKey, user);
  return queryClient;
}
