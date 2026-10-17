import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "@/api/client";
import { failureReason } from "@/api/errors";
import type { components } from "@/api/schema";
import { statusToast } from "@/features/tasks/repeat";
import { useTaskMutation } from "@/features/tasks/task-cache";
import { useOfferUndo } from "@/features/tasks/task-undo";

export type Notification = components["schemas"]["NotificationOut"];
export type NotificationList = components["schemas"]["NotificationListOut"];
export type Snooze = components["schemas"]["Snooze"];

/** The snooze times the notification center offers, in the order it lists them. */
export const SNOOZE_OPTIONS: { until: Snooze; label: string }[] = [
  { until: "in_15_minutes", label: "15 minutes" },
  { until: "in_1_hour", label: "1 hour" },
  { until: "in_3_hours", label: "3 hours" },
  { until: "tomorrow_morning", label: "Tomorrow 09:00" },
];

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

/** Complete the Task a Reminder notification is about, then offer Undo in a toast. */
export function useCompleteFromReminder() {
  const offerUndo = useOfferUndo();
  return useTaskMutation({
    mutationFn: async (id: number) => {
      const { data, error } = await api.POST("/api/v1/notifications/{notification_id}/complete", {
        params: { path: { notification_id: id } },
      });
      if (!data) {
        throw new Error(failureReason(error, "Could not complete the task."));
      }
      return data;
    },
    onSuccess: ({ task, affected }) => {
      offerUndo(statusToast(task, "completed", affected.length - 1), {
        kind: "statuses",
        affected,
      });
    },
    alsoRefetch: [notificationsQuery.queryKey],
  });
}

/** Fire a Reminder notification once more later; the Task stays as it is. */
export function useSnoozeReminder() {
  return useNotificationsMutation(
    async ({ id, until }: { id: number; until: Snooze }) =>
      (
        await api.POST("/api/v1/notifications/{notification_id}/snooze", {
          params: { path: { notification_id: id } },
          body: { until },
        })
      ).response,
  );
}
