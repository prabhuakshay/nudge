import { useEffect, useState } from "react";

import { formatLongDate, formatTime } from "@/lib/datetime";

const MINUTE_MS = 60_000;

/** The current day, date and time, updated on each minute boundary. */
export function Clock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timeout = setTimeout(
      () => {
        setNow(new Date());
      },
      MINUTE_MS - (now.getTime() % MINUTE_MS),
    );
    return () => {
      clearTimeout(timeout);
    };
  }, [now]);

  return (
    <time dateTime={now.toISOString()} className="text-xs text-muted-foreground tabular-nums">
      {formatLongDate(now)} · {formatTime(now)}
    </time>
  );
}
