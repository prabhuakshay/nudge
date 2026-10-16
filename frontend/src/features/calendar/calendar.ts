import { queryOptions } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { isValid, parseISO } from "date-fns";
import { useCallback } from "react";

import { api } from "@/api/client";
import type { components } from "@/api/schema";
import { validateTaskSearch, type TaskSearch } from "@/features/tasks/open-task";
import { CALENDAR_KEY } from "@/features/tasks/tasks";
import { useMediaQuery } from "@/lib/use-media-query";

/** The Tasks on a range of days, as the API returns them. */
export type CalendarRange = components["schemas"]["CalendarOut"];

/** How much the Calendar shows at once. */
export type CalendarMode = "month" | "week" | "day";

/** The modes in the order the switcher offers them. */
export const MODES: readonly CalendarMode[] = ["month", "week", "day"];

/** The modes a phone offers: seven columns are unreadable below `sm`. */
const PHONE_MODES: readonly CalendarMode[] = ["month", "day"];

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

/** Whether the screen is narrower than `sm`, where the Calendar lays itself out for a phone. */
export function usePhone(): boolean {
  return !useMediaQuery("(min-width: 640px)");
}

type GoOptions = { mode?: CalendarMode; replace?: boolean };

/**
 * Where the Calendar is looking, kept in the address: its mode and the day it is on, today when
 * the address names none. Returns them, the modes this screen offers, and a function to move to
 * another day, or to another mode on the same day, which adds to the browser history unless
 * `replace` is set. A phone shows a Week link as Day mode on the same day.
 */
export function useCalendarPlace(today: string) {
  // Without a route to tie it to, the search comes unvalidated, so validate it here too.
  const search = validateCalendarSearch(useSearch({ strict: false }));
  const modes = usePhone() ? PHONE_MODES : MODES;
  const { mode: asked = "month", date = today } = search;
  const mode = modes.includes(asked) ? asked : "day";
  const navigate = useNavigate();
  const go = useCallback(
    (to: string, { mode: toMode = mode, replace = false }: GoOptions = {}) => {
      void navigate({ to: ".", search: (prev) => ({ ...prev, mode: toMode, date: to }), replace });
    },
    [navigate, mode],
  );
  return { mode, date, modes, go };
}
