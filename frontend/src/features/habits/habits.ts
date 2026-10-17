import { queryOptions } from "@tanstack/react-query";

import { api } from "@/api/client";
import { failureReason } from "@/api/errors";
import type { components } from "@/api/schema";
import { todayIn } from "@/features/tasks/schedule";
import { editing, useCacheMutation } from "@/lib/cache-mutation";

export type Habit = components["schemas"]["HabitOut"];
export type HabitFields = components["schemas"]["HabitIn"];
export type HabitIconKey = Habit["icon"];

/** The most Check-ins a Habit's Goal can ask for in a day, as the server allows. */
export const MAX_GOAL = 99;

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

/** A Habit and the number of Check-ins it should have today. */
type CheckInsChange = { id: number; count: number };

/** Set how many Check-ins a Habit has today on the user's clock; its row shows them at once. */
export function useSetTodayCheckIns(timeZone: string) {
  return useCacheMutation({
    mutationFn: async ({ id, count }: CheckInsChange) => {
      const { data, error } = await api.PUT("/api/v1/habits/{habit_id}/check-ins/{day}", {
        params: { path: { habit_id: id, day: todayIn(timeZone) } },
        body: { count },
      });
      if (!data) throw new Error(failureReason(error, "Could not check in."));
      return data;
    },
    optimistic: editing(habitsQuery.queryKey, (habits, { id, count }: CheckInsChange) =>
      habits.map((habit) => (habit.id === id ? { ...habit, today_count: count } : habit)),
    ),
    refetch: [habitsQuery.queryKey],
  });
}
