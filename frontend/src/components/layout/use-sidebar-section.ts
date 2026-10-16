import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/api/client";
import { sessionQuery, type User } from "@/features/auth/session";

/** A sidebar section the user can collapse, saved on their account. */
export type SidebarSectionName = "projects" | "tags" | "people";

/**
 * Whether a sidebar section is collapsed, and a toggle that shows the change at once and then
 * saves it to the user's account, so every device opens the sidebar the same way.
 */
export function useSidebarSection(section: SidebarSectionName) {
  const queryClient = useQueryClient();
  const { data: user } = useQuery(sessionQuery);
  const field = `${section}_collapsed` as const;
  const collapsed = user?.[field] ?? true;
  const save = useMutation({
    mutationFn: async (value: boolean): Promise<User> => {
      const { data } = await api.PATCH("/api/v1/auth/sidebar-sections", {
        body: { [field]: value },
      });
      if (!data) throw new Error("Could not save the sidebar.");
      return data;
    },
    onMutate: async (value) => {
      await queryClient.cancelQueries(sessionQuery);
      queryClient.setQueryData(sessionQuery.queryKey, (cached) =>
        cached ? { ...cached, [field]: value } : cached,
      );
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(sessionQuery.queryKey, saved);
    },
    onError: () => queryClient.invalidateQueries(sessionQuery),
  });
  return {
    collapsed,
    toggle: () => {
      save.mutate(!collapsed);
    },
  };
}
