import { queryOptions } from "@tanstack/react-query";

import { api } from "@/api/client";
import { failureReason } from "@/api/errors";
import type { components } from "@/api/schema";
import { editing, useCacheMutation } from "@/lib/cache-mutation";

export type Habit = components["schemas"]["HabitOut"];
export type HabitIconKey = Habit["icon"];
export type Frequency = Habit["frequency"];
/** Every setting the user picks in the Add and Edit dialogs. */
export type HabitSettings = Omit<Habit, "id">;
type HabitChange = { id: number } & HabitSettings;

/** The user's Habits in their order. */
export const habitsQuery = queryOptions({
  queryKey: ["habits"],
  queryFn: async (): Promise<Habit[]> => {
    const { data } = await api.GET("/api/v1/habits");
    if (!data) throw new Error("Could not load the habits.");
    return data;
  },
});

/** Add a Habit; the server puts it last. */
export function useCreateHabit() {
  return useCacheMutation({
    mutationFn: async (fields: HabitSettings) => {
      const { data, error } = await api.POST("/api/v1/habits", { body: fields });
      if (!data) throw new Error(failureReason(error, "Could not add the habit."));
      return data;
    },
    refetch: [habitsQuery.queryKey],
  });
}

/** Change a Habit's settings; the list shows them at once. */
export function useUpdateHabit() {
  return useCacheMutation({
    mutationFn: async ({ id, ...fields }: HabitChange) => {
      const { data, error } = await api.PATCH("/api/v1/habits/{habit_id}", {
        params: { path: { habit_id: id } },
        body: fields,
      });
      if (!data) throw new Error(failureReason(error, "Could not save the habit."));
      return data;
    },
    optimistic: editing(habitsQuery.queryKey, (habits, { id, ...fields }: HabitChange) =>
      habits.map((habit) => (habit.id === id ? { ...habit, ...fields } : habit)),
    ),
    refetch: [habitsQuery.queryKey],
  });
}
