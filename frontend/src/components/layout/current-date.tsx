import { useEffect, useState } from "react";

import { formatLongDate } from "@/lib/datetime";

function nextMidnight(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
}

/** Today's day and date, rolling over at local midnight. */
export function CurrentDate() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timeout = setTimeout(
      () => {
        setNow(new Date());
      },
      nextMidnight(now).getTime() - now.getTime(),
    );
    return () => {
      clearTimeout(timeout);
    };
  }, [now]);

  return <p className="text-xs text-muted-foreground">{formatLongDate(now)}</p>;
}
