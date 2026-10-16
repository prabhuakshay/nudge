import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "@/api/client";

/** The user's private Calendar feed address, or null while the feed is off. */
export const calendarFeedQuery = queryOptions({
  queryKey: ["calendar-feed"],
  queryFn: async () => {
    const { data } = await api.GET("/api/v1/calendar/feed");
    if (!data) throw new Error("Could not load your Calendar feed.");
    return data.url;
  },
});

/** Turns the feed on, or gives it a new address when it is already on. */
export function useTurnOnCalendarFeed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.POST("/api/v1/calendar/feed");
      if (!data) throw new Error("Could not turn on your Calendar feed.");
      return data.url;
    },
    onSuccess: (url) => {
      queryClient.setQueryData(calendarFeedQuery.queryKey, url);
    },
  });
}

/** Turns the feed off, so its address stops working. */
export function useTurnOffCalendarFeed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { response } = await api.DELETE("/api/v1/calendar/feed");
      if (!response.ok) throw new Error("Could not turn off your Calendar feed.");
    },
    onSuccess: () => {
      queryClient.setQueryData(calendarFeedQuery.queryKey, null);
    },
  });
}
