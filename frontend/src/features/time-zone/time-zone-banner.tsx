import { Globe, LoaderCircle } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { User } from "@/features/auth/session";

import { browserTimeZone, useSetTimeZone } from "./time-zone";

/** Remembers the browser zone the user said no to, so the banner doesn't come back for it. */
const DISMISSED_KEY = "nudge-time-zone-dismissed";

function readDismissed(): string | null {
  try {
    return localStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
}

function saveDismissed(timeZone: string): void {
  try {
    localStorage.setItem(DISMISSED_KEY, timeZone);
  } catch {
    // Storage can be blocked (private mode); the banner then only stays hidden for this visit.
  }
}

/**
 * Offers to switch the user's time zone when the browser is somewhere else, such as after
 * travelling. Switching is never silent because it changes when every reminder fires.
 */
export function TimeZoneBanner({ user }: { user: User }) {
  const setTimeZone = useSetTimeZone();
  const [dismissed, setDismissed] = useState(readDismissed);
  const browserZone = browserTimeZone();

  if (!user.time_zone || user.time_zone === browserZone || dismissed === browserZone) {
    return null;
  }

  return (
    <section
      aria-label="Time zone"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-primary-soft px-4 py-2.5 text-sm lg:px-8"
    >
      <Globe className="size-4 shrink-0 text-primary" aria-hidden />
      <p className="min-w-0 flex-1">
        <span className="font-semibold">Switch to {browserZone}?</span>{" "}
        <span className="text-muted-foreground">Your times are in {user.time_zone}.</span>
      </p>
      {setTimeZone.isError && (
        <p role="alert" className="w-full font-medium text-danger sm:order-last">
          Couldn&apos;t switch your time zone. Check your connection and try again.
        </p>
      )}
      <div className="flex gap-2">
        <Button
          variant="ghost"
          onClick={() => {
            saveDismissed(browserZone);
            setDismissed(browserZone);
          }}
        >
          Dismiss
        </Button>
        <Button
          disabled={setTimeZone.isPending}
          onClick={() => {
            setTimeZone.mutate(browserZone);
          }}
        >
          {setTimeZone.isPending && <LoaderCircle className="animate-spin" aria-hidden />}
          Switch
        </Button>
      </div>
    </section>
  );
}
