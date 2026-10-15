import { useEffect, useState } from "react";

const SECOND_MS = 1000;
const TIME_FORMAT = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** The current date and time to the second, floating faintly in the bottom-right corner. */
export function Clock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    // Aligning to the second boundary keeps the display in step with the system clock.
    const timeout = setTimeout(
      () => {
        setNow(new Date());
      },
      SECOND_MS - (now.getTime() % SECOND_MS),
    );
    return () => {
      clearTimeout(timeout);
    };
  }, [now]);

  const date = now.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const timeParts = TIME_FORMAT.formatToParts(now);

  return (
    <time
      dateTime={now.toISOString()}
      className="pointer-events-none fixed right-3 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-20 rounded-full border border-border bg-surface/70 px-2.5 py-1 text-[11px] text-muted-foreground tabular-nums opacity-60 shadow-sm backdrop-blur lg:right-4 lg:bottom-4"
    >
      {date} ·{" "}
      {timeParts.map(({ type, value }, index) => (
        <span key={index} className={type === "second" ? "opacity-50" : undefined}>
          {value}
        </span>
      ))}
    </time>
  );
}
