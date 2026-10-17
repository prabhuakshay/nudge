import { queryOptions } from "@tanstack/react-query";

import { api } from "@/api/client";
import { failureReason } from "@/api/errors";
import type { components } from "@/api/schema";
import { useCacheMutation } from "@/lib/cache-mutation";

export type Habit = components["schemas"]["HabitOut"];
export type HabitFields = components["schemas"]["HabitIn"];
export type HabitIconKey = Habit["icon"];

/** The user's Habits in their order. */
export const habitsQuery = queryOptions({
  queryKey: ["habits"],
  queryFn: async (): Promise<Habit[]> => {
    const { data } = await api.GET("/api/v1/habits");
    if (!data) throw new Error("Could not load the habits.");
    return data;
  },
});

/** Add a daily Habit, starting today; the server puts it last. */
export function useCreateHabit() {
  return useCacheMutation({
    mutationFn: async (fields: HabitFields) => {
      const { data, error } = await api.POST("/api/v1/habits", { body: fields });
      if (!data) throw new Error(failureReason(error, "Could not add the habit."));
      return data;
    },
    refetch: [habitsQuery.queryKey],
  });
}
