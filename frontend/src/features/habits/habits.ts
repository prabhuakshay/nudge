import { queryOptions } from "@tanstack/react-query";

import { api } from "@/api/client";
import { failureReason } from "@/api/errors";
import type { components } from "@/api/schema";
import { todayIn } from "@/features/tasks/schedule";
import { moveAfter } from "@/features/tags/tags";
import { editing, useCacheMutation } from "@/lib/cache-mutation";

export type Habit = components["schemas"]["HabitOut"];
export type HabitIconKey = Habit["icon"];
export type Frequency = Habit["frequency"];
/** Every setting the user picks in the Add and Edit dialogs. */
export type HabitSettings = Omit<Habit, "id" | "is_archived" | "today_count">;

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

/**
 * The Habits for Today's strip, in the user's order: the server picks the live ones due today and
 * the times-a-week ones whose week isn't met yet.
 */
export const todayHabitsQuery = queryOptions({
  queryKey: ["habits", "today"],
  queryFn: async (): Promise<Habit[]> => {
    const { data } = await api.GET("/api/v1/habits/today");
    if (!data) throw new Error("Could not load today's habits.");
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

/** A Habit and the number of Check-ins it should have today. */
type CheckInsChange = { id: number; count: number };

const countToday = (habits: Habit[], { id, count }: CheckInsChange) =>
  habits.map((habit) => (habit.id === id ? { ...habit, today_count: count } : habit));

/**
 * Set how many Check-ins a Habit has today on the user's clock; the Habits page and Today's strip
 * show them at once.
 */
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
    optimistic: {
      // ["habits"] is the prefix of both queries, so a failure puts both back.
      touches: habitsQuery.queryKey,
      show: (queryClient, change: CheckInsChange) => {
        for (const { queryKey } of [habitsQuery, todayHabitsQuery]) {
          editing(queryKey, countToday).show(queryClient, change);
        }
      },
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
