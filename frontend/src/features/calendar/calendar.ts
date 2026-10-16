import { queryOptions } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { isValid, parseISO } from "date-fns";
import { useCallback } from "react";

import { api } from "@/api/client";
import type { components } from "@/api/schema";
import { validateTaskSearch, type TaskSearch } from "@/features/tasks/open-task";
import { CALENDAR_KEY } from "@/features/tasks/tasks";

/** The Tasks on a range of days, as the API returns them. */
export type CalendarRange = components["schemas"]["CalendarOut"];

/** How much the Calendar shows at once. */
export type CalendarMode = "month";

const MODES: readonly CalendarMode[] = ["month"];

/**
 * The Calendar's search parameters: the mode, the day it is looking at (which picks the month),
 * and the Task open in the drawer. Missing ones mean Month mode on today.
 */
export type CalendarSearch = TaskSearch & { mode?: CalendarMode; date?: string };

function isMode(mode: unknown): mode is CalendarMode {
  return MODES.some((each) => each === mode);
}

function isIsoDate(date: unknown): date is string {
  return typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) && isValid(parseISO(date));
}

/** Keep only a known mode and a real date, so a mistyped link just shows today's month. */
export function validateCalendarSearch(search: Record<string, unknown>): CalendarSearch {
  const { mode, date } = search;
  return {
    ...validateTaskSearch(search),
    ...(isMode(mode) && { mode }),
    ...(isIsoDate(date) && { date }),
  };
}

/** The dated Tasks, open and Closed, whose dates overlap `start` to `end`, both included. */
export function calendarQuery({ start, end }: { start: string; end: string }) {
  return queryOptions({
    queryKey: [...CALENDAR_KEY, start, end],
    queryFn: async (): Promise<CalendarRange> => {
      const { data } = await api.GET("/api/v1/tasks/calendar", {
        params: { query: { start, end } },
      });
      if (!data) {
        throw new Error("Could not load your calendar.");
      }
      return data;
    },
  });
}

/**
 * Where the Calendar is looking, kept in the address: its mode and the day it is on, today when
 * the address names none. Returns them and a function to move to another day, which adds to the
 * browser history unless `replace` is set.
 */
export function useCalendarPlace(today: string) {
  // Without a route to tie it to, the search comes unvalidated, so validate it here too.
  const { mode = "month", date = today } = validateCalendarSearch(useSearch({ strict: false }));
  const navigate = useNavigate();
  const go = useCallback(
    (to: string, { replace = false } = {}) => {
      void navigate({ to: ".", search: (prev) => ({ ...prev, mode, date: to }), replace });
    },
    [navigate, mode],
  );
  return { mode, date, go };
}
