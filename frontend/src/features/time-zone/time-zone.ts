/**
 * The user's time zone. Every clock time in Nudge is floating in this zone, so it is set once
 * from the browser and afterwards only changes when the user says so.
 */
import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { api } from "@/api/client";
import { sessionQuery, type User } from "@/features/auth/session";

/** The IANA zone this browser is in, such as `Europe/London`. */
export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** Every IANA zone the browser knows, for picking one in Settings. */
export const TIME_ZONES: readonly string[] = Intl.supportedValuesOf("timeZone");

async function saveTimeZone(timeZone: string): Promise<User> {
  const { data } = await api.PUT("/api/v1/auth/time-zone", { body: { time_zone: timeZone } });
  if (!data) {
    throw new Error("Could not save your time zone.");
  }
  return data;
}

/**
 * Give a user without a time zone the browser's, which is how the zone is set on first sign-in.
 * Returns the user as it now is; if saving fails the user keeps no zone and the next visit tries
 * again, because the app must still open.
 */
export async function adoptBrowserTimeZone(queryClient: QueryClient, user: User): Promise<User> {
  if (user.time_zone) {
    return user;
  }
  try {
    const saved = await saveTimeZone(browserTimeZone());
    queryClient.setQueryData(sessionQuery.queryKey, saved);
    return saved;
  } catch {
    return user;
  }
}

/** Change the user's time zone and put the updated user in the session cache. */
export function useSetTimeZone() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: saveTimeZone,
    onSuccess: (user) => {
      queryClient.setQueryData(sessionQuery.queryKey, user);
    },
  });
}
