import { queryOptions } from "@tanstack/react-query";

import { api } from "@/api/client";
import { failureReason } from "@/api/errors";
import type { components } from "@/api/schema";
import { moveAfter } from "@/features/tags/tags";
import { editing, useCacheMutation } from "@/lib/cache-mutation";

export type Habit = components["schemas"]["HabitOut"];
export type HabitIconKey = Habit["icon"];
export type Frequency = Habit["frequency"];
/** Every setting the user picks in the Add and Edit dialogs. */
export type HabitSettings = Omit<Habit, "id" | "is_archived">;

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

/** A change to one or more Habits that the page shows at once, before the server answers. */
function useHabitMutation<V>(
  change: (variables: V) => Promise<void>,
  optimistic: (habits: Habit[], variables: V) => Habit[],
) {
  return useCacheMutation({
    mutationFn: change,
    optimistic: editing(habitsQuery.queryKey, optimistic),
    refetch: [habitsQuery.queryKey],
  });
}

/** Change a Habit's settings; the list shows them at once. */
export function useUpdateHabit() {
  return useHabitMutation(
    async ({ id, ...fields }: { id: number } & HabitSettings) => {
      const { error } = await api.PATCH("/api/v1/habits/{habit_id}", {
        params: { path: { habit_id: id } },
        body: fields,
      });
      if (error) throw new Error(failureReason(error, "Could not save the habit."));
    },
    (habits, { id, ...fields }) =>
      habits.map((habit) => (habit.id === id ? { ...habit, ...fields } : habit)),
  );
}

/** Move a Habit right after another, or first for null. */
export function useMoveHabit() {
  return useHabitMutation(
    async ({ id, afterId }: { id: number; afterId: number | null }) => {
      const { response } = await api.POST("/api/v1/habits/{habit_id}/move", {
        params: { path: { habit_id: id } },
        body: { after_id: afterId },
      });
      if (!response.ok) throw new Error("Could not move the habit.");
    },
    (habits, { id, afterId }) => moveAfter(habits, id, afterId),
  );
}

/** Archive a Habit, keeping its history and place, or bring it back. */
export function useSetArchived() {
  return useHabitMutation(
    async ({ id, archived }: { id: number; archived: boolean }) => {
      const params = { path: { habit_id: id } };
      const { error } = archived
        ? await api.POST("/api/v1/habits/{habit_id}/archive", { params })
        : await api.POST("/api/v1/habits/{habit_id}/unarchive", { params });
      if (error) throw new Error(failureReason(error, "Could not archive the habit."));
    },
    (habits, { id, archived }) =>
      habits.map((habit) => (habit.id === id ? { ...habit, is_archived: archived } : habit)),
  );
}

/** Delete a Habit and its history for good. */
export function useDeleteHabit() {
  return useHabitMutation(
    async (id: number) => {
      const { response } = await api.DELETE("/api/v1/habits/{habit_id}", {
        params: { path: { habit_id: id } },
      });
      if (!response.ok) throw new Error("Could not delete the habit.");
    },
    (habits, id) => habits.filter((habit) => habit.id !== id),
  );
}
