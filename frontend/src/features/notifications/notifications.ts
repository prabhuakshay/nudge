import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "@/api/client";
import type { components } from "@/api/schema";

export type Notification = components["schemas"]["NotificationOut"];
export type NotificationList = components["schemas"]["NotificationListOut"];

/** The latest notifications and the unread count. Polled so new ones appear while the app is open. */
export const notificationsQuery = queryOptions({
  queryKey: ["notifications"],
  queryFn: async (): Promise<NotificationList> => {
    const { data } = await api.GET("/api/v1/notifications");
    if (!data) {
      throw new Error("Could not load your notifications.");
    }
    return data;
  },
  refetchInterval: 60 * 1000,
});

/** A change to the notification center that refreshes the list once the server has it. */
function useNotificationsMutation<Variables>(change: (variables: Variables) => Promise<Response>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (variables: Variables) => {
      const response = await change(variables);
      if (!response.ok) {
        throw new Error("Could not update your notifications.");
      }
    },
    onSettled: () => queryClient.invalidateQueries(notificationsQuery),
  });
}

export function useMarkRead() {
  return useNotificationsMutation(
    async (id: number) =>
      (
        await api.POST("/api/v1/notifications/{notification_id}/read", {
          params: { path: { notification_id: id } },
        })
      ).response,
  );
}

export function useMarkAllRead() {
  return useNotificationsMutation(
    async () => (await api.POST("/api/v1/notifications/read-all")).response,
  );
}

export function useDismiss() {
  return useNotificationsMutation(
    async (id: number) =>
      (
        await api.DELETE("/api/v1/notifications/{notification_id}", {
          params: { path: { notification_id: id } },
        })
      ).response,
  );
}

/** Notify the user, to check that notifications reach the notification center and devices. */
export function useSendTestNotification() {
  return useNotificationsMutation(
    async () => (await api.POST("/api/v1/notifications/test")).response,
  );
}
