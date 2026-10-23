import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback } from "react";

/** The Habits page's search parameters: the Habit whose details are open, if any. */
export type HabitSearch = { habit?: number };

/** Keep `?habit=` only when it is a Habit id, so a mistyped link just shows the list. */
export function validateHabitSearch(search: Record<string, unknown>): HabitSearch {
  const { habit } = search;
  return typeof habit === "number" && Number.isSafeInteger(habit) && habit > 0 ? { habit } : {};
}

/**
 * The Habit whose details are open, kept in the URL's `?habit=` so a link opens it and the
 * browser's Back closes it. Returns its id and a function to open another, or to close it with
 * null.
 */
export function useOpenHabit() {
  // Without a route to tie it to, the search comes unvalidated, so validate it here too.
  const { habit } = validateHabitSearch(useSearch({ strict: false }));
  const navigate = useNavigate();
  const setOpenHabit = useCallback(
    (habitId: number | null) => {
      void navigate({ to: ".", search: habitId === null ? {} : { habit: habitId } });
    },
    [navigate],
  );
  return { openHabitId: habit ?? null, setOpenHabit };
}
